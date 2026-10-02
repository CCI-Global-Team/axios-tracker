# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: public (API key) release endpoints, used by the GitHub webhook automation (GAM-400)."""

# Python imports
import re
from collections import defaultdict

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ProjectEntityPermission, WorkspaceEntityPermission
from plane.app.serializers import ReleaseSerializer
from plane.db.models import Issue, Project, Release
from plane.db.models.project import ROLE
from plane.utils import releases as release_service
from .base import BaseAPIView

KEY_PATTERN = re.compile(r"^([A-Z0-9]+)-(\d+)$")
MAX_KEYS = 500


def _releases(slug, project_id):
    return Release.objects.filter(workspace__slug=slug, project_id=project_id).select_related("owned_by")


def _counted(slug, project_id):
    return release_service.with_counts(_releases(slug, project_id), project_id)


def _error(exc):
    if isinstance(exc, release_service.ReleaseConflict):
        return Response(
            {"error": "Some work items are already in another open release", "issue_ids": exc.issue_ids},
            status=status.HTTP_409_CONFLICT,
        )
    return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class ReleaseListCreateAPIEndpoint(BaseAPIView):
    permission_classes = [ProjectEntityPermission]

    def get(self, request, slug, project_id):
        return Response(ReleaseSerializer(_counted(slug, project_id), many=True).data, status=status.HTTP_200_OK)

    def post(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        serializer = ReleaseSerializer(
            data=request.data,
            context={"project_id": project.id, "workspace_id": project.workspace_id, "user": request.user},
        )
        serializer.is_valid(raise_exception=True)
        extra = {} if "checklist" in request.data else {"checklist": release_service.default_checklist()}
        release = serializer.save(project=project, workspace_id=project.workspace_id, **extra)
        return Response(
            ReleaseSerializer(_counted(slug, project_id).get(pk=release.pk)).data, status=status.HTTP_201_CREATED
        )


class ReleaseDetailAPIEndpoint(BaseAPIView):
    permission_classes = [ProjectEntityPermission]

    def get(self, request, slug, project_id, pk):
        return Response(ReleaseSerializer(_counted(slug, project_id).get(pk=pk)).data, status=status.HTTP_200_OK)

    def patch(self, request, slug, project_id, pk):
        release = _releases(slug, project_id).get(pk=pk)
        serializer = ReleaseSerializer(release, data=request.data, partial=True, context={"user": request.user})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ReleaseSerializer(_counted(slug, project_id).get(pk=pk)).data, status=status.HTTP_200_OK)


class ReleaseIssueListCreateAPIEndpoint(BaseAPIView):
    permission_classes = [ProjectEntityPermission]

    def get(self, request, slug, project_id, release_id):
        release = _releases(slug, project_id).get(pk=release_id)
        return Response(release_service.release_items(release), status=status.HTTP_200_OK)

    def post(self, request, slug, project_id, release_id):
        release = _releases(slug, project_id).get(pk=release_id)
        issue_ids = request.data.get("issue_ids", [])
        if not isinstance(issue_ids, list) or not issue_ids:
            return Response({"error": "issue_ids is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            added = release_service.add_issues(release, issue_ids, request.user)
        except (release_service.ReleaseConflict, release_service.ReleaseError) as exc:
            return _error(exc)
        return Response(
            {"added": added, "items": release_service.release_items(release)}, status=status.HTTP_201_CREATED
        )


class ReleaseIssueDetailAPIEndpoint(BaseAPIView):
    permission_classes = [ProjectEntityPermission]

    def delete(self, request, slug, project_id, release_id, issue_id):
        release = _releases(slug, project_id).get(pk=release_id)
        try:
            removed = release_service.remove_issue(release, issue_id, request.user)
        except release_service.ReleaseError as exc:
            return _error(exc)
        if not removed:
            return Response({"error": "This work item is not in the release"}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReleaseShipAPIEndpoint(BaseAPIView):
    """Record that work items reached production.

    Body: ``{"keys": ["GAM-12", ...], "via": "github:<owner/repo>@<sha7>"}``. Keys in projects the caller
    cannot write to are reported as unknown, the same as keys that do not exist, so the response does
    not reveal other projects' work items. Safe to repeat.
    """

    permission_classes = [WorkspaceEntityPermission]

    def post(self, request, slug):
        keys = request.data.get("keys")
        via = request.data.get("via") or "api"
        if not isinstance(keys, list) or not keys or not all(isinstance(k, str) for k in keys):
            return Response(
                {"error": "keys must be a non-empty list of work item keys"}, status=status.HTTP_400_BAD_REQUEST
            )
        if len(keys) > MAX_KEYS:
            return Response({"error": f"At most {MAX_KEYS} keys per request"}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(via, str) or len(via) > 255:
            return Response(
                {"error": "via must be a string of at most 255 characters"}, status=status.HTTP_400_BAD_REQUEST
            )

        wanted = defaultdict(set)
        unknown = []
        seen = set()
        for raw in keys:
            key = raw.strip().upper()
            if key in seen:
                continue
            seen.add(key)
            match = KEY_PATTERN.match(key)
            if match is None:
                unknown.append(raw)
                continue
            wanted[match.group(1)].add(int(match.group(2)))

        projects = {
            p.identifier: p
            for p in Project.objects.filter(
                workspace__slug=slug,
                identifier__in=list(wanted),
                archived_at__isnull=True,
                project_projectmember__member=request.user,
                project_projectmember__is_active=True,
                project_projectmember__role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value],
                project_projectmember__deleted_at__isnull=True,
            ).distinct()
        }

        results = []
        for identifier, sequence_ids in wanted.items():
            project = projects.get(identifier)
            issues = []
            if project is not None:
                issues = list(
                    Issue.issue_objects.filter(project=project, sequence_id__in=sequence_ids)
                    .select_related("state", "project")
                    .order_by("sequence_id")
                )
            found = {i.sequence_id for i in issues}
            unknown.extend(f"{identifier}-{n}" for n in sorted(sequence_ids - found))
            if issues:
                results.extend(release_service.ship_issues(project, issues, via, request.user))

        return Response({"results": results, "unknown": unknown}, status=status.HTTP_200_OK)

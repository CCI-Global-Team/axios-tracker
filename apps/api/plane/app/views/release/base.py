# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import ReleaseSerializer
from plane.db.models import Issue, Project, Release
from plane.utils import releases as release_service
from plane.utils.host import base_host
from .. import BaseAPIView

READ_ROLES = [ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST]
WRITE_ROLES = [ROLE.ADMIN, ROLE.MEMBER]


def _releases(slug, project_id):
    return Release.objects.filter(workspace__slug=slug, project_id=project_id).select_related("owned_by")


def _error(exc):
    if isinstance(exc, release_service.ReleaseConflict):
        return Response(
            {"error": "Some work items are already in another open release", "issue_ids": exc.issue_ids},
            status=status.HTTP_409_CONFLICT,
        )
    return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class ReleaseEndpoint(BaseAPIView):
    @allow_permission(READ_ROLES)
    def get(self, request, slug, project_id, pk=None):
        queryset = release_service.with_counts(_releases(slug, project_id), project_id)
        if pk is None:
            return Response(ReleaseSerializer(queryset, many=True).data, status=status.HTTP_200_OK)
        release = queryset.get(pk=pk)
        return Response(ReleaseSerializer(release).data, status=status.HTTP_200_OK)

    @allow_permission(WRITE_ROLES)
    def post(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        serializer = ReleaseSerializer(
            data=request.data,
            context={"project_id": project.id, "workspace_id": project.workspace_id, "user": request.user},
        )
        serializer.is_valid(raise_exception=True)
        extra = {} if "checklist" in request.data else {"checklist": release_service.default_checklist()}
        release = serializer.save(project=project, workspace_id=project.workspace_id, **extra)
        release = release_service.with_counts(_releases(slug, project_id), project_id).get(pk=release.pk)
        return Response(ReleaseSerializer(release).data, status=status.HTTP_201_CREATED)

    @allow_permission(WRITE_ROLES)
    def patch(self, request, slug, project_id, pk):
        release = _releases(slug, project_id).get(pk=pk)
        serializer = ReleaseSerializer(release, data=request.data, partial=True, context={"user": request.user})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        release = release_service.with_counts(_releases(slug, project_id), project_id).get(pk=pk)
        return Response(ReleaseSerializer(release).data, status=status.HTTP_200_OK)

    @allow_permission(WRITE_ROLES)
    def delete(self, request, slug, project_id, pk):
        release = _releases(slug, project_id).get(pk=pk)
        # Drop the links now rather than via the async cascade, so the items are free to join
        # another open release immediately.
        release.release_issues.all().delete()
        release.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReleaseIssueEndpoint(BaseAPIView):
    @allow_permission(READ_ROLES)
    def get(self, request, slug, project_id, release_id):
        release = _releases(slug, project_id).get(pk=release_id)
        return Response(release_service.release_items(release), status=status.HTTP_200_OK)

    @allow_permission(WRITE_ROLES)
    def post(self, request, slug, project_id, release_id):
        release = _releases(slug, project_id).get(pk=release_id)
        issue_ids = request.data.get("issue_ids", [])
        if not isinstance(issue_ids, list) or not issue_ids:
            return Response({"error": "issue_ids is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            added = release_service.add_issues(
                release, issue_ids, request.user, origin=base_host(request=request, is_app=True)
            )
        except (release_service.ReleaseConflict, release_service.ReleaseError) as exc:
            return _error(exc)
        return Response(
            {"added": added, "items": release_service.release_items(release)}, status=status.HTTP_201_CREATED
        )

    @allow_permission(WRITE_ROLES)
    def delete(self, request, slug, project_id, release_id, issue_id):
        release = _releases(slug, project_id).get(pk=release_id)
        try:
            removed = release_service.remove_issue(
                release, issue_id, request.user, origin=base_host(request=request, is_app=True)
            )
        except release_service.ReleaseError as exc:
            return _error(exc)
        if not removed:
            return Response({"error": "This work item is not in the release"}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReleaseActionEndpoint(BaseAPIView):
    """POST mark-released / reopen / roll-back."""

    ACTIONS = {
        "mark-released": release_service.mark_released,
        "reopen": release_service.reopen,
        "roll-back": release_service.roll_back,
    }

    @allow_permission(WRITE_ROLES)
    def post(self, request, slug, project_id, release_id, action):
        handler = self.ACTIONS.get(action)
        if handler is None:
            return Response({"error": "Unknown action"}, status=status.HTTP_404_NOT_FOUND)
        release = _releases(slug, project_id).get(pk=release_id)
        try:
            result = handler(release, request.user, origin=base_host(request=request, is_app=True))
        except release_service.ReleaseError as exc:
            return _error(exc)
        release = release_service.with_counts(_releases(slug, project_id), project_id).get(pk=release_id)
        return Response({**result, "release": ReleaseSerializer(release).data}, status=status.HTTP_200_OK)


class ReleaseCandidateEndpoint(BaseAPIView):
    @allow_permission(WRITE_ROLES)
    def get(self, request, slug, project_id):
        Project.objects.get(pk=project_id, workspace__slug=slug)
        search = request.GET.get("search", "").strip() or None
        return Response(release_service.release_candidates(project_id, search=search), status=status.HTTP_200_OK)


class IssueReleaseEndpoint(BaseAPIView):
    @allow_permission(READ_ROLES)
    def get(self, request, slug, project_id, issue_id):
        issue = Issue.objects.get(pk=issue_id, project_id=project_id, workspace__slug=slug)
        return Response(release_service.current_release_link(issue.id), status=status.HTTP_200_OK)

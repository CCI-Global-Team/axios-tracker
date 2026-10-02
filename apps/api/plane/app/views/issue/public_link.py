# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import Issue, WorkItemPublicLink
from plane.utils.host import base_host
from plane.utils.public_links import serialize_public_link
from .. import BaseAPIView


class WorkItemPublicLinkEndpoint(BaseAPIView):
    """CCI: create, list and revoke share links for one work item (GAM-401).

    Guests may not see or make links: a link exposes the item to anyone holding the URL.
    """

    def _issue(self, slug, project_id, issue_id):
        return Issue.issue_objects.get(pk=issue_id, project_id=project_id, workspace__slug=slug)

    def _log(self, request, kind, link):
        issue_activity.delay(
            type=f"public_link.activity.{kind}",
            requested_data=json.dumps(
                {"id": str(link.id), "include_description": link.include_description}, cls=DjangoJSONEncoder
            ),
            actor_id=str(request.user.id),
            issue_id=str(link.issue_id),
            project_id=str(link.project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=False,
            origin=base_host(request=request, is_app=True),
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id, issue_id):
        issue = self._issue(slug, project_id, issue_id)
        links = WorkItemPublicLink.objects.filter(issue=issue, revoked_at__isnull=True).order_by("-created_at")
        return Response([serialize_public_link(request, link) for link in links], status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        issue = self._issue(slug, project_id, issue_id)
        include_description = request.data.get("include_description", False)
        if not isinstance(include_description, bool):
            return Response({"error": "include_description must be true or false"}, status=status.HTTP_400_BAD_REQUEST)
        link = WorkItemPublicLink(issue=issue, project_id=issue.project_id, include_description=include_description)
        link.save(created_by_id=request.user.id)
        self._log(request, "created", link)
        return Response(serialize_public_link(request, link), status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, issue_id, link_id):
        link = WorkItemPublicLink.objects.get(
            pk=link_id, issue_id=issue_id, project_id=project_id, workspace__slug=slug
        )
        # Revoking twice is a no-op, so a double click or a retried request is harmless.
        if link.revoked_at is None:
            link.revoked_at = timezone.now()
            link.save(update_fields=["revoked_at", "updated_at", "updated_by"])
            self._log(request, "deleted", link)
        return Response(status=status.HTTP_204_NO_CONTENT)

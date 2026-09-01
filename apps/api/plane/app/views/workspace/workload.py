# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Django imports
from django.db.models import Count

# Module imports
from ..base import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Issue


class MemberWorkloadEndpoint(BaseAPIView):
    """CCI: how many open work items each member holds, workspace-wide.

    A count, not hours: nothing in this edition denominates load in hours (time estimates are
    Enterprise-only, worklogs do not exist), so an "hours remaining" would be invented.

    Workspace-wide rather than per-project, because a number that understates load is worse than
    no number — it gets trusted.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        # `issue_objects` already excludes drafts and archived items. Open means not finished and
        # not abandoned: backlog, unstarted and started all still sit on somebody's plate, and
        # that includes the Ready for Test / In Testing states CCI added.
        rows = (
            Issue.issue_objects.filter(workspace__slug=slug, assignees__isnull=False)
            .exclude(state__group__in=["completed", "cancelled"])
            .values("assignees__id")
            .annotate(open_issues=Count("id", distinct=True))
        )
        return Response(
            [{"member_id": str(row["assignees__id"]), "open_issues": row["open_issues"]} for row in rows],
            status=status.HTTP_200_OK,
        )

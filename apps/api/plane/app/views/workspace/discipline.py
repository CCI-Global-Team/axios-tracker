# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers.discipline import MemberDisciplineSerializer
from plane.db.models import DISCIPLINE_CHOICES, MemberDiscipline, Workspace, WorkspaceMember


class MemberDisciplineViewSet(BaseAPIView):
    """CCI: what each member works on.

    Read is open to any workspace member: choosing who to hand a work item to is everyone's
    problem, not just a lead's. Writing your own is likewise open; writing someone ELSE's needs
    Admin, because a discipline is partly an assessment and partly a claim on the work someone
    gets offered, and neither should be editable by a peer.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        rows = (
            MemberDiscipline.objects.filter(workspace__slug=slug)
            .select_related("member")
            .exclude(member__is_bot=True)
        )
        return Response(
            {
                "choices": [{"value": v, "label": label} for v, label in DISCIPLINE_CHOICES],
                "members": MemberDisciplineSerializer(rows, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        """Upsert one member's disciplines. Defaults to the caller; Admin may name another."""
        workspace = Workspace.objects.get(slug=slug)
        member_id = request.data.get("member_id")

        if member_id and str(member_id) != str(request.user.id):
            actor = WorkspaceMember.objects.filter(
                workspace=workspace, member=request.user, is_active=True
            ).first()
            if actor is None or actor.role != ROLE.ADMIN.value:
                return Response(
                    {"error": "Only an admin can set another member's disciplines"},
                    status=status.HTTP_403_FORBIDDEN,
                )
            target = WorkspaceMember.objects.filter(
                workspace=workspace, member_id=member_id, is_active=True
            ).first()
            if target is None:
                return Response(
                    {"error": "That member is not in this workspace"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            member = target.member
        else:
            member = request.user

        serializer = MemberDisciplineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        row, _ = MemberDiscipline.objects.update_or_create(
            workspace=workspace,
            member=member,
            defaults={
                "disciplines": serializer.validated_data.get("disciplines", []),
                "source": serializer.validated_data.get("source", ""),
                "updated_by": request.user,
            },
        )
        return Response(MemberDisciplineSerializer(row).data, status=status.HTTP_200_OK)

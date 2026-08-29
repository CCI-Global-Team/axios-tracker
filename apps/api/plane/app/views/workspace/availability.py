# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import date, timedelta

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers.availability import MemberAvailabilitySerializer
from plane.db.models import MemberAvailability, Workspace


def current_monday():
    today = date.today()
    return today - timedelta(days=today.weekday())


class MemberAvailabilityViewSet(BaseAPIView):
    model = MemberAvailability

    def get_serializer_class(self):
        return MemberAvailabilitySerializer

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        """Declared availability for every member for one week (defaults to this week)."""
        week_start = request.GET.get("week_start", current_monday().isoformat())
        availabilities = MemberAvailability.objects.filter(
            workspace__slug=slug, week_start=week_start
        ).select_related("member")
        return Response(
            MemberAvailabilitySerializer(availabilities, many=True).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        """Upsert the CALLING user's own declaration. Never accepts a member id from the client."""
        serializer = MemberAvailabilitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        workspace = Workspace.objects.get(slug=slug)
        availability, _ = MemberAvailability.objects.update_or_create(
            workspace=workspace,
            member=request.user,
            week_start=serializer.validated_data["week_start"],
            defaults={
                "available_hours": serializer.validated_data["available_hours"],
                "note": serializer.validated_data.get("note", ""),
            },
        )
        return Response(
            MemberAvailabilitySerializer(availability).data,
            status=status.HTTP_200_OK,
        )

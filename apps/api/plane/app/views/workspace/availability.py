# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import timedelta

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Django imports
from django.utils import timezone

# Module imports
from ..base import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers.availability import MemberAvailabilitySerializer
from plane.db.models import MemberAvailability, Workspace


# CCI's week starts on SUNDAY — services are Sunday, so the ministry week begins there, and a
# Monday anchor would split a weekend across two declarations. This is also what every user's
# own `Profile.start_of_the_week` says (it defaults to Sunday), so the availability week and the
# calendars elsewhere in the product now agree.
#
# Python's weekday() is Monday=0 … Sunday=6, so the offset back to the most recent Sunday is
# (weekday + 1) % 7: Sunday itself → 0, Monday → 1, Saturday → 6.
def current_week_start():
    today = timezone.localdate()
    return today - timedelta(days=(today.weekday() + 1) % 7)


class MemberAvailabilityViewSet(BaseAPIView):
    model = MemberAvailability

    def get_serializer_class(self):
        return MemberAvailabilitySerializer

    # Guests are deliberately excluded: capacity is planning information for the people doing and
    # allocating the work. Matches Analytics, the nearest comparable workspace-level view.
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        """Declared availability for every member for one week (defaults to this week)."""
        week_start = request.GET.get("week_start", current_week_start().isoformat())
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
                "available_hours": serializer.validated_data.get("available_hours", 0),
                "note": serializer.validated_data.get("note", ""),
            },
        )
        return Response(
            MemberAvailabilitySerializer(availability).data,
            status=status.HTTP_200_OK,
        )

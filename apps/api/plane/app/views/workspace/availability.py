# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

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
def week_start_for(user=None):
    """The Sunday opening the current week, in the MEMBER's timezone.

    The week has to be derived somewhere, and doing it on the client meant the writer and the
    reader could disagree: the browser computed a local Sunday while the server computed a UTC
    one. Across the Saturday-Sunday boundary those differ, so a volunteer in Lagos declaring late
    Saturday wrote next week's row and one in Dallas wrote last week's — and both then reported
    that they had set their availability and it wasn't showing.

    Deriving it here, from the member's own timezone, gives one answer that both sides share.
    """
    tz = None
    user_timezone = getattr(user, "user_timezone", None)
    if user_timezone:
        try:
            tz = ZoneInfo(user_timezone)
        except (ZoneInfoNotFoundError, ValueError):
            # A stale or malformed timezone string must not take the endpoint down; fall back to
            # the server's own clock, which is what the whole workspace shared before this.
            tz = None
    today = timezone.localdate(timezone=tz) if tz else timezone.localdate()
    return today - timedelta(days=(today.weekday() + 1) % 7)


class MemberAvailabilityViewSet(BaseAPIView):
    model = MemberAvailability

    def get_serializer_class(self):
        return MemberAvailabilitySerializer

    # Guests are deliberately excluded: capacity is planning information for the people doing and
    # allocating the work. Matches Analytics, the nearest comparable workspace-level view.
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        """Declared availability for every member for one week (defaults to this week).

        Rows come from two places. A row written FOR this week is a fresh declaration. A member
        with no row for this week but a persistent declaration from an earlier week gets that one
        carried forward, reported against the requested week and flagged `is_carried` so the
        interface can keep the two distinct. A member with neither is simply absent — callers join
        against the member list to find them, because "no answer" is its own answer.
        """
        week_start = request.GET.get("week_start") or week_start_for(request.user).isoformat()

        declared = list(
            MemberAvailability.objects.filter(workspace__slug=slug, week_start=week_start).select_related("member")
        )
        declared_member_ids = {row.member_id for row in declared}

        # DISTINCT ON (member_id) with a descending week ordering takes the most recent persistent
        # declaration per member — Postgres-specific, which this deployment is.
        carried = list(
            MemberAvailability.objects.filter(
                workspace__slug=slug, is_persistent=True, week_start__lt=week_start
            )
            .exclude(member_id__in=declared_member_ids)
            .order_by("member_id", "-week_start")
            .distinct("member_id")
            .select_related("member")
        )

        payload = MemberAvailabilitySerializer(declared, many=True).data
        for row in MemberAvailabilitySerializer(carried, many=True).data:
            # Report the carried value against the week that was ASKED for, not the week it was
            # written in — it is this week's effective number — but say that it was carried.
            payload.append({**row, "week_start": week_start, "is_carried": True})

        return Response(payload, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        """Upsert the CALLING user's own declaration. Never accepts a member id from the client."""
        data = request.data.copy()
        # week_start is optional: omitting it lets the server derive the week from the member's
        # timezone, which is the only way writer and reader are guaranteed to agree.
        if not data.get("week_start"):
            data["week_start"] = week_start_for(request.user).isoformat()

        serializer = MemberAvailabilitySerializer(data=data)
        serializer.is_valid(raise_exception=True)

        workspace = Workspace.objects.get(slug=slug)
        availability, _ = MemberAvailability.objects.update_or_create(
            workspace=workspace,
            member=request.user,
            week_start=serializer.validated_data["week_start"],
            defaults={
                "available_hours": serializer.validated_data.get("available_hours", 0),
                "note": serializer.validated_data.get("note", ""),
                "is_persistent": serializer.validated_data.get("is_persistent", False),
            },
        )
        return Response(
            MemberAvailabilitySerializer(availability).data,
            status=status.HTTP_200_OK,
        )

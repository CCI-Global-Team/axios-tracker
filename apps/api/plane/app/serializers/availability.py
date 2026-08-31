# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import MemberAvailability

MAX_DECLARABLE_HOURS = 80


class MemberAvailabilitySerializer(BaseSerializer):
    member_id = serializers.UUIDField(source="member.id", read_only=True)
    display_name = serializers.CharField(source="member.display_name", read_only=True)
    # Always false on a stored row; the view overrides it to true for rows it carries forward from
    # an earlier week. Serialised explicitly so clients never have to infer it from the dates.
    is_carried = serializers.SerializerMethodField()

    def get_is_carried(self, _obj) -> bool:
        return False

    class Meta:
        model = MemberAvailability
        fields = [
            "member_id",
            "display_name",
            "week_start",
            "available_hours",
            "note",
            "is_persistent",
            "is_carried",
        ]

    # Sunday, per the CCI week — see current_week_start() in the view for why.
    # Python's weekday(): Monday=0 … Sunday=6.
    def validate_week_start(self, value):
        if value.weekday() != 6:
            raise serializers.ValidationError("week_start must be a Sunday")
        return value

    def validate_available_hours(self, value):
        if value > MAX_DECLARABLE_HOURS:
            raise serializers.ValidationError(f"available_hours cannot exceed {MAX_DECLARABLE_HOURS}")
        return value

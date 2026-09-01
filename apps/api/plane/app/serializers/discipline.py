# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import DISCIPLINE_VALUES, MemberDiscipline

# A person can genuinely hold two or three. Beyond that the label stops narrowing anything, which
# is the only thing it is for.
MAX_DISCIPLINES = 3


class MemberDisciplineSerializer(BaseSerializer):
    member_id = serializers.UUIDField(source="member.id", read_only=True)
    display_name = serializers.CharField(source="member.display_name", read_only=True)

    class Meta:
        model = MemberDiscipline
        fields = ["member_id", "display_name", "disciplines", "source"]

    def validate_disciplines(self, value):
        # Order carries no meaning, so collapse duplicates while keeping the first occurrence -
        # a set would reshuffle the list on every write and make the UI flicker.
        seen = []
        for item in value:
            if item not in seen:
                seen.append(item)
        unknown = [item for item in seen if item not in DISCIPLINE_VALUES]
        if unknown:
            raise serializers.ValidationError(f"unknown discipline(s): {', '.join(unknown)}")
        if len(seen) > MAX_DISCIPLINES:
            raise serializers.ValidationError(f"at most {MAX_DISCIPLINES} disciplines")
        return seen

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from .base import BaseSerializer
from plane.db.models import Initiative, User, WorkspaceMember


class InitiativeSerializer(BaseSerializer):
    lead_id = serializers.PrimaryKeyRelatedField(
        source="lead", queryset=User.objects.all(), required=False, allow_null=True
    )
    module_ids = serializers.ListField(child=serializers.UUIDField(), read_only=True)
    project_ids = serializers.ListField(child=serializers.UUIDField(), read_only=True)
    total_issues = serializers.IntegerField(read_only=True)
    completed_issues = serializers.IntegerField(read_only=True)
    cancelled_issues = serializers.IntegerField(read_only=True)
    started_issues = serializers.IntegerField(read_only=True)
    unstarted_issues = serializers.IntegerField(read_only=True)
    backlog_issues = serializers.IntegerField(read_only=True)

    class Meta:
        model = Initiative
        fields = [
            "id",
            "name",
            "description",
            "lead_id",
            "start_date",
            "target_date",
            "sort_order",
            "created_by",
            "created_at",
            "updated_at",
            "module_ids",
            "project_ids",
            "total_issues",
            "completed_issues",
            "cancelled_issues",
            "started_issues",
            "unstarted_issues",
            "backlog_issues",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at"]
        validators = []

    def validate_name(self, value):
        queryset = Initiative.objects.filter(workspace_id=self.context["workspace_id"], name=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("An initiative with this name already exists in this workspace.")
        return value

    def validate_lead_id(self, value):
        if (
            value
            and not WorkspaceMember.objects.filter(
                workspace_id=self.context["workspace_id"], member=value, is_active=True, role__gte=15
            ).exists()
        ):
            raise serializers.ValidationError("The lead must be an active workspace member.")
        return value


class InitiativeModulesSerializer(serializers.Serializer):
    module_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)

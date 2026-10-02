# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid

# Django imports
from django.utils import timezone

# Third Party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import OPEN_RELEASE_STATUSES, Release, ReleaseStatus, User, WorkspaceMember

# Statuses a person may set directly. Released and Rolled back are reached only through the
# ship / mark released / reopen / roll back actions, which also move the items.
EDITABLE_STATUSES = (ReleaseStatus.PLANNING.value, ReleaseStatus.FROZEN.value, ReleaseStatus.CANCELLED.value)


class ReleaseSerializer(BaseSerializer):
    owned_by = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False, allow_null=True)
    # Counts are annotated by the views (plane.utils.releases.with_counts); 0 when not annotated.
    total_items = serializers.SerializerMethodField()
    shipped_items = serializers.SerializerMethodField()
    unplanned_items = serializers.SerializerMethodField()
    ready_items = serializers.SerializerMethodField()

    class Meta:
        model = Release
        fields = [
            "id",
            "name",
            "version",
            "description_html",
            "status",
            "target_date",
            "released_at",
            "owned_by",
            "checklist",
            "sort_order",
            "project",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "total_items",
            "shipped_items",
            "unplanned_items",
            "ready_items",
        ]
        read_only_fields = [
            "id",
            "released_at",
            "project",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def get_total_items(self, instance):
        return getattr(instance, "total_items", 0) or 0

    def get_shipped_items(self, instance):
        return getattr(instance, "shipped_items", 0) or 0

    def get_unplanned_items(self, instance):
        return getattr(instance, "unplanned_items", 0) or 0

    def get_ready_items(self, instance):
        return getattr(instance, "ready_items", 0) or 0

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Name is required")
        project_id = self.instance.project_id if self.instance else self.context.get("project_id")
        clash = Release.objects.filter(project_id=project_id, name=value)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("A release with this name already exists in this project")
        return value

    def validate_status(self, value):
        if value not in EDITABLE_STATUSES:
            raise serializers.ValidationError("Use the release actions to mark released, reopen or roll back")
        if self.instance and self.instance.status not in EDITABLE_STATUSES and value != self.instance.status:
            raise serializers.ValidationError("Reopen this release before changing its status")
        # Imported here: plane.utils.releases pulls in the activity task, which imports serializers.
        from plane.utils.releases import open_conflicts

        if (
            self.instance
            and self.instance.status == ReleaseStatus.CANCELLED.value
            and value in OPEN_RELEASE_STATUSES
            and open_conflicts(self.instance)
        ):
            # A cancelled release's items were free to join another release meanwhile.
            raise serializers.ValidationError(
                "Some of its work items are now in another open release; remove them there first"
            )
        return value

    def validate_owned_by(self, value):
        if value is None:
            return value
        workspace_id = self.instance.workspace_id if self.instance else self.context.get("workspace_id")
        if not WorkspaceMember.objects.filter(workspace_id=workspace_id, member=value, is_active=True).exists():
            raise serializers.ValidationError("The owner must be a member of this workspace")
        return value

    def validate_checklist(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Checklist must be a list")
        previous = {item.get("id"): item for item in (self.instance.checklist if self.instance else []) or []}
        user = self.context.get("user")
        now = timezone.now().isoformat()
        cleaned = []
        for item in value:
            if not isinstance(item, dict) or not str(item.get("text", "")).strip():
                raise serializers.ValidationError("Each checklist item needs text")
            item_id = str(item.get("id") or uuid.uuid4())
            done = bool(item.get("done", False))
            before = previous.get(item_id, {})
            # Stamp who ticked an item and when on the server, so the record cannot be back-dated.
            if done and before.get("done"):
                done_at, done_by = before.get("done_at"), before.get("done_by")
            elif done:
                done_at, done_by = now, str(user.id) if user else None
            else:
                done_at, done_by = None, None
            cleaned.append(
                {"id": item_id, "text": str(item["text"]).strip(), "done": done, "done_at": done_at, "done_by": done_by}
            )
        return cleaned

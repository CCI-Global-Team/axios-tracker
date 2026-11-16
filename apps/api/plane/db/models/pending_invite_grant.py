# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import models

from .base import BaseModel


# CCI: picker choices waiting for the workspace invite to become a membership.
class PendingInviteGrant(BaseModel):
    class Kind(models.TextChoices):
        PROJECT_MEMBER = "project_member", "Project member"
        LABEL_OWNER = "label_owner", "Campus label owner"
        PROJECT_DEFAULT_ASSIGNEE = "project_default_assignee", "Project default assignee"
        PROJECT_LEAD = "project_lead", "Project lead"
        ISSUE_ASSIGNEE = "issue_assignee", "Work item assignee"

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="pending_invite_grants")
    invite = models.ForeignKey("db.WorkspaceMemberInvite", on_delete=models.CASCADE, related_name="pending_grants")
    email = models.EmailField(max_length=255)
    kind = models.CharField(max_length=32, choices=Kind.choices)
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="pending_invite_grants")
    target_id = models.UUIDField(null=True, blank=True)

    def save(self, *args, **kwargs):
        self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    class Meta:
        db_table = "pending_invite_grants"
        ordering = ("-created_at",)

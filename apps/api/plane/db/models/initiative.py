# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import models
from django.db.models import Q

from .workspace import WorkspaceBaseModel


class Initiative(WorkspaceBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    lead = models.ForeignKey("db.User", on_delete=models.SET_NULL, null=True, related_name="led_initiatives")
    start_date = models.DateField(null=True)
    target_date = models.DateField(null=True)
    sort_order = models.FloatField(default=65535)

    class Meta:
        unique_together = ["name", "workspace", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "workspace"],
                condition=Q(deleted_at__isnull=True),
                name="initiative_unique_name_workspace_when_deleted_at_null",
            )
        ]
        db_table = "initiatives"
        ordering = ("sort_order", "-created_at")


class InitiativeModule(WorkspaceBaseModel):
    initiative = models.ForeignKey("db.Initiative", on_delete=models.CASCADE, related_name="initiative_modules")
    module = models.ForeignKey("db.Module", on_delete=models.CASCADE, related_name="initiative_modules")

    class Meta:
        unique_together = ["initiative", "module", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["initiative", "module"],
                condition=Q(deleted_at__isnull=True),
                name="initiative_module_unique_when_deleted_at_null",
            )
        ]
        db_table = "initiative_modules"

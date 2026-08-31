# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .base import BaseModel


class MemberAvailability(BaseModel):
    """CCI: hours a member declares they can give in a given week."""

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="member_availabilities",
    )
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="availabilities",
    )
    week_start = models.DateField(help_text="Sunday that opens the week this declaration covers")
    available_hours = models.PositiveSmallIntegerField(default=0)
    note = models.CharField(max_length=255, blank=True)
    # When set, this declaration carries into later weeks that have no row of their own. Without
    # it the whole table empties every Sunday and someone with a steady commitment has to retype
    # it 52 times a year. Deliberately opt-in: a carried value is a standing commitment the
    # member chose, which is a different fact from silence, and a lead reads that difference.
    is_persistent = models.BooleanField(default=False)

    class Meta:
        unique_together = ["workspace", "member", "week_start", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "member", "week_start"],
                condition=models.Q(deleted_at__isnull=True),
                name="member_availability_unique_workspace_member_week",
            )
        ]
        verbose_name = "Member Availability"
        verbose_name_plural = "Member Availabilities"
        db_table = "member_availabilities"
        ordering = ("-week_start",)

    def __str__(self):
        return f"{self.member_id} {self.week_start}: {self.available_hours}h"

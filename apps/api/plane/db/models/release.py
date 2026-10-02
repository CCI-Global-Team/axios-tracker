# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel


class ReleaseStatus(models.TextChoices):
    PLANNING = "planning", "Planning"
    FROZEN = "frozen", "Frozen"
    RELEASED = "released", "Released"
    ROLLED_BACK = "rolled_back", "Rolled back"
    CANCELLED = "cancelled", "Cancelled"


# A release is "open" while work can still be added to it or shipped through it. An item may sit in
# at most one open release at a time, so shipping a key always has exactly one place to land.
OPEN_RELEASE_STATUSES = (ReleaseStatus.PLANNING.value, ReleaseStatus.FROZEN.value)

RELEASED_STATE_NAME = "Released"

DEFAULT_RELEASE_CHECKLIST = [
    "Migrations applied",
    "Environment variables and secrets set",
    "Feature flags switched on",
    "Deploy order followed (backend before clients)",
    "Smoke-tested on production",
]


class Release(ProjectBaseModel):
    """CCI: a batch of work items that reaches production together.

    Items join a release while it is planning or frozen; the release closes itself once every item
    has shipped to the production branch (see plane.utils.releases).
    """

    name = models.CharField(max_length=255, verbose_name="Release Name")
    version = models.CharField(max_length=64, blank=True)
    # The release notes.
    description_html = models.TextField(blank=True, default="<p></p>")
    status = models.CharField(
        max_length=20,
        choices=ReleaseStatus.choices,
        default=ReleaseStatus.PLANNING,
    )
    target_date = models.DateField(null=True)
    released_at = models.DateTimeField(null=True)
    owned_by = models.ForeignKey(
        "db.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="owned_releases",
    )
    # [{id, text, done, done_at, done_by}]
    checklist = models.JSONField(default=list)
    sort_order = models.FloatField(default=65535)

    class Meta:
        unique_together = ["name", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "project"],
                condition=Q(deleted_at__isnull=True),
                name="release_unique_name_project_when_deleted_at_null",
            )
        ]
        verbose_name = "Release"
        verbose_name_plural = "Releases"
        db_table = "releases"
        ordering = ("-created_at",)

    @property
    def is_open(self):
        return self.status in OPEN_RELEASE_STATUSES

    def __str__(self):
        return f"{self.name} <{self.project_id}>"


class ReleaseIssue(ProjectBaseModel):
    release = models.ForeignKey("db.Release", on_delete=models.CASCADE, related_name="release_issues")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="issue_releases")
    # The state the item left when it was moved to Released, so Reopen can put it back.
    previous_state = models.ForeignKey(
        "db.State",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    shipped_at = models.DateTimeField(null=True)
    # "manual" or "github:<owner/repo>@<sha7>"
    shipped_via = models.CharField(max_length=255, blank=True)
    # Shipped to production without having been planned into a release.
    is_unplanned = models.BooleanField(default=False)

    class Meta:
        unique_together = ["release", "issue", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["release", "issue"],
                condition=Q(deleted_at__isnull=True),
                name="release_issue_unique_release_issue_when_deleted_at_null",
            )
        ]
        verbose_name = "Release Issue"
        verbose_name_plural = "Release Issues"
        db_table = "release_issues"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.release_id} {self.issue_id}"

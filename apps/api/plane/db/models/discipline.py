# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models

# Module imports
from .base import BaseModel

# Stored value -> label. The stored half is a slug so the label can be reworded without a data
# migration, and so a discipline that reads differently to the team ("WordPress / No-Code") does
# not put punctuation in the database.
DISCIPLINE_CHOICES = [
    ("frontend", "Frontend"),
    ("backend", "Backend"),
    ("fullstack", "Fullstack"),
    ("mobile", "Mobile"),
    ("design", "Design"),
    ("product", "Product"),
    ("project_management", "Project Management"),
    ("qa", "QA"),
    ("devops", "DevOps"),
    ("data", "Data"),
    ("nocode", "WordPress / No-Code"),
]

DISCIPLINE_VALUES = [value for value, _ in DISCIPLINE_CHOICES]


class MemberDiscipline(BaseModel):
    """CCI: what a member works on, independent of which product they are working on.

    One row per member holding the whole set, rather than a row per discipline: the UI writes the
    set as a unit, and a person's disciplines are read together far more often than one at a time.

    Deliberately separate from project membership. A project says which product someone can be
    assigned work in; this says what kind of work suits them. Someone can be Frontend on three
    products at once, and folding the two together would force a choice that is not real.
    """

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="member_disciplines",
    )
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="disciplines",
    )
    disciplines = ArrayField(
        models.CharField(max_length=32, choices=DISCIPLINE_CHOICES),
        blank=True,
        default=list,
    )
    # Where the value came from - "application form", "assessed (new intake)", "set by <name>".
    # Kept because most of these were derived from intake spreadsheets of differing reliability,
    # and a lead deciding who to hand work to should be able to see how firm the label is.
    source = models.CharField(max_length=120, blank=True)

    class Meta:
        unique_together = ["workspace", "member", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "member"],
                condition=models.Q(deleted_at__isnull=True),
                name="member_discipline_unique_workspace_member",
            )
        ]
        verbose_name = "Member Discipline"
        verbose_name_plural = "Member Disciplines"
        db_table = "member_disciplines"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.member_id}: {','.join(self.disciplines)}"

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# CCI: persist picker selections until workspace invitation acceptance.
import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0133_label_default_assignee"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PendingInviteGrant",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        unique=True,
                        editable=False,
                        db_index=True,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("email", models.EmailField(max_length=255)),
                (
                    "kind",
                    models.CharField(
                        max_length=32,
                        choices=[
                            ("project_member", "Project member"),
                            ("label_owner", "Campus label owner"),
                            ("project_default_assignee", "Project default assignee"),
                            ("project_lead", "Project lead"),
                            ("issue_assignee", "Work item assignee"),
                        ],
                    ),
                ),
                ("target_id", models.UUIDField(null=True, blank=True)),
                (
                    "workspace",
                    models.ForeignKey(
                        to="db.workspace",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="pending_invite_grants",
                    ),
                ),
                (
                    "invite",
                    models.ForeignKey(
                        to="db.workspacememberinvite",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="pending_grants",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        to="db.project",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="pending_invite_grants",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        to=settings.AUTH_USER_MODEL,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        null=True,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        to=settings.AUTH_USER_MODEL,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        null=True,
                        verbose_name="Last Modified By",
                    ),
                ),
            ],
            options={"db_table": "pending_invite_grants", "ordering": ("-created_at",)},
        ),
    ]

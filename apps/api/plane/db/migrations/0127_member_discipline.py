# Generated for CCI: per-member disciplines.

import django.contrib.postgres.fields
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0126_notification_preference_assignment"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="MemberDiscipline",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("disciplines", django.contrib.postgres.fields.ArrayField(
                    base_field=models.CharField(choices=[
                        ("frontend", "Frontend"), ("backend", "Backend"), ("fullstack", "Fullstack"),
                        ("mobile", "Mobile"), ("design", "Design"), ("product", "Product"),
                        ("project_management", "Project Management"), ("qa", "QA"),
                        ("devops", "DevOps"), ("data", "Data"), ("nocode", "WordPress / No-Code"),
                    ], max_length=32),
                    blank=True, default=list, size=None)),
                ("source", models.CharField(blank=True, max_length=120)),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("member", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="disciplines", to=settings.AUTH_USER_MODEL)),
                ("updated_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By")),
                ("workspace", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="member_disciplines", to="db.workspace")),
            ],
            options={
                "verbose_name": "Member Discipline",
                "verbose_name_plural": "Member Disciplines",
                "db_table": "member_disciplines",
                "ordering": ("-created_at",),
                "unique_together": {("workspace", "member", "deleted_at")},
            },
        ),
        migrations.AddConstraint(
            model_name="memberdiscipline",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("workspace", "member"),
                name="member_discipline_unique_workspace_member",
            ),
        ),
    ]

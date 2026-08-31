# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import migrations, models
import datetime


def monday_rows_to_sunday(apps, schema_editor):
    """Re-anchor existing declarations from Monday to the Sunday that opens the same week.

    Rows written before this change are anchored on a Monday: a row dated Mon 31 Aug meant the
    week Mon 31 Aug - Sun 6 Sep. Under Sunday anchoring that same week opens on Sun 30 Aug, so
    each row moves back exactly one day and keeps covering the week its author had in mind.

    Only Monday-dated rows are touched. Anything already on a Sunday is left alone, so this is
    safe to re-run and safe on a database that has both.
    """
    MemberAvailability = apps.get_model("db", "MemberAvailability")
    for row in MemberAvailability.objects.all():
        if row.week_start.weekday() == 0:  # Monday
            row.week_start = row.week_start - datetime.timedelta(days=1)
            row.save(update_fields=["week_start"])


def sunday_rows_to_monday(apps, schema_editor):
    """Reverse: Sunday-anchored rows go forward a day to the Monday they used to sit on."""
    MemberAvailability = apps.get_model("db", "MemberAvailability")
    for row in MemberAvailability.objects.all():
        if row.week_start.weekday() == 6:  # Sunday
            row.week_start = row.week_start + datetime.timedelta(days=1)
            row.save(update_fields=["week_start"])


class Migration(migrations.Migration):
    dependencies = [("db", "0123_member_availability")]

    operations = [
        migrations.AlterField(
            model_name="memberavailability",
            name="week_start",
            field=models.DateField(help_text="Sunday that opens the week this declaration covers"),
        ),
        migrations.RunPython(monday_rows_to_sunday, sunday_rows_to_monday),
    ]

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0124_availability_week_starts_sunday")]

    operations = [
        migrations.AddField(
            model_name="memberavailability",
            name="is_persistent",
            field=models.BooleanField(default=False),
        ),
    ]

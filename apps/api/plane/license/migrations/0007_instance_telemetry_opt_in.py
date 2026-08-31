# CCI: telemetry becomes opt-in.
#
# Upstream defaults is_telemetry_enabled to True, which sends usage data to Plane Software, Inc.
# at https://telemetry.plane.so. That is a third party, not CCI, and nobody on this deployment
# chose it. This changes the default for instances created from here on.
#
# Existing rows are deliberately NOT rewritten: whatever the current instance has is a setting
# someone may have chosen in god-mode, and a migration should not silently override a live choice.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("license", "0006_instance_is_current_version_deprecated"),
    ]

    operations = [
        migrations.AlterField(
            model_name="instance",
            name="is_telemetry_enabled",
            field=models.BooleanField(default=False),
        ),
    ]

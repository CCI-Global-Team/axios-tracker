# Generated for CCI: carry disciplines on an invite until it is accepted.

import django.contrib.postgres.fields
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0127_member_discipline")]

    operations = [
        migrations.AddField(
            model_name="workspacememberinvite",
            name="disciplines",
            field=django.contrib.postgres.fields.ArrayField(
                base_field=models.CharField(max_length=32), blank=True, default=list, size=None
            ),
        )
    ]

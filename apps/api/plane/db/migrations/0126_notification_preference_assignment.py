# Generated for CCI: a dedicated assignment notification preference.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0125_availability_is_persistent")]

    operations = [
        migrations.AddField(
            model_name="usernotificationpreference",
            name="assignment",
            field=models.BooleanField(default=True),
        )
    ]

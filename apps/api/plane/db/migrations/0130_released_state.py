# Generated for CCI: give every existing project a "Released" state (GAM-400).
#
# Released sits in the completed group just before Done, so shipping an item to production closes
# it for reporting while product/QA still move it to Done by hand.

from django.db import migrations

RELEASED = "Released"
RELEASED_COLOR = "#0EA5E9"
RELEASED_SEQUENCE = 40000
# Used when a project already has a state at 40000; still between UAT-style states and Done (45000).
FALLBACK_SEQUENCE = 44000
# Marks the states this migration creates, so reversing it never deletes a Released state a team made.
MARKER = "cci:0130_released_state"


def add_released_state(apps, schema_editor):
    Project = apps.get_model("db", "Project")
    State = apps.get_model("db", "State")

    states = []
    for project in Project.objects.filter(deleted_at__isnull=True).iterator():
        if State.objects.filter(project_id=project.id, name__iexact=RELEASED, deleted_at__isnull=True).exists():
            continue
        taken = State.objects.filter(
            project_id=project.id, sequence=RELEASED_SEQUENCE, deleted_at__isnull=True
        ).exists()
        states.append(
            State(
                name=RELEASED,
                slug="released",
                color=RELEASED_COLOR,
                sequence=FALLBACK_SEQUENCE if taken else RELEASED_SEQUENCE,
                group="completed",
                external_source=MARKER,
                project_id=project.id,
                workspace_id=project.workspace_id,
            )
        )
    State.objects.bulk_create(states, batch_size=500)


def remove_unused_released_states(apps, schema_editor):
    State = apps.get_model("db", "State")
    Issue = apps.get_model("db", "Issue")

    used = Issue.objects.filter(state__external_source=MARKER).values_list("state_id", flat=True)
    State.objects.filter(external_source=MARKER).exclude(id__in=used).delete()


class Migration(migrations.Migration):
    dependencies = [("db", "0129_release")]

    operations = [migrations.RunPython(add_released_state, remove_unused_released_states)]

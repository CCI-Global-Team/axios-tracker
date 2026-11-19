import uuid

import pytest

from plane.bgtasks.issue_activities_task import track_estimate_points
from plane.db.models import Estimate, EstimatePoint, Project


@pytest.fixture
def project(workspace, create_user):
    return Project.objects.create(
        name="Test Project",
        identifier="TP",
        workspace=workspace,
        created_by=create_user,
    )


@pytest.fixture
def points(project):
    estimate = Estimate.objects.create(name="Points", type="points", project=project)
    return [
        EstimatePoint.objects.create(estimate=estimate, key=key, value=value, project=project)
        for key, value in [(1, "3"), (2, "5")]
    ]


def _track(project, create_user, old, new):
    activities = []
    track_estimate_points(
        requested_data={"estimate_point": new},
        current_instance={"estimate_point": old},
        issue_id=uuid.uuid4(),
        project_id=project.id,
        workspace_id=project.workspace_id,
        actor_id=create_user.id,
        issue_activities=activities,
        epoch=0,
    )
    return activities


@pytest.mark.unit
@pytest.mark.django_db
class TestTrackEstimatePoints:
    def test_clearing_an_estimate_records_a_removal(self, project, create_user, points):
        [activity] = _track(project, create_user, str(points[0].id), None)

        assert activity.verb == "removed"
        assert activity.field == "estimate_points"
        assert activity.old_value == "3"
        assert activity.new_value is None
        assert activity.old_identifier == str(points[0].id)
        assert activity.new_identifier is None

    def test_changing_an_estimate_records_an_update(self, project, create_user, points):
        [activity] = _track(project, create_user, str(points[0].id), str(points[1].id))

        assert activity.verb == "updated"
        assert activity.field == "estimate_points"
        assert (activity.old_value, activity.new_value) == ("3", "5")

    def test_setting_a_first_estimate_records_an_update(self, project, create_user, points):
        [activity] = _track(project, create_user, None, str(points[1].id))

        assert activity.verb == "updated"
        assert activity.field == "estimate_points"
        assert (activity.old_value, activity.new_value) == (None, "5")

    def test_clearing_a_point_that_no_longer_exists_falls_back_to_estimate_point(self, project, create_user):
        [activity] = _track(project, create_user, str(uuid.uuid4()), None)

        assert activity.verb == "removed"
        assert activity.field == "estimate_point"

    def test_unchanged_estimate_records_nothing(self, project, create_user, points):
        assert _track(project, create_user, str(points[0].id), str(points[0].id)) == []

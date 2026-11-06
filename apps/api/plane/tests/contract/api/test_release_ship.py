# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: contract tests for POST /api/v1/workspaces/<slug>/releases/ship/ (GAM-400)."""

from uuid import uuid4

import pytest
from rest_framework import status

from plane.db.models import Issue, Release, ReleaseIssue, ReleaseStatus, User
from plane.tests.contract.release_helpers import build_project, make_issue

VIA = "github:CCI-Global-Team/cci-backend@abc1234"


@pytest.fixture
def project_and_states(db, workspace, create_user):
    return build_project(workspace, create_user, identifier="SHP")


@pytest.fixture
def project(project_and_states):
    return project_and_states[0]


@pytest.fixture
def states(project_and_states):
    return project_and_states[1]


def ship(client, workspace, keys, via=VIA):
    return client.post(f"/api/v1/workspaces/{workspace.slug}/releases/ship/", {"keys": keys, "via": via}, format="json")


def key(issue):
    return f"SHP-{issue.sequence_id}"


def plan(project, issues, name="Planned", status_value=ReleaseStatus.PLANNING):
    release = Release.objects.create(name=name, project=project, workspace=project.workspace, status=status_value)
    ReleaseIssue.objects.bulk_create(
        [ReleaseIssue(release=release, issue=i, project=project, workspace=project.workspace) for i in issues]
    )
    return release


@pytest.mark.contract
class TestReleaseShip:
    @pytest.mark.django_db
    def test_ship_moves_to_released_and_closes_when_all_shipped(self, api_key_client, workspace, project, states):
        a = make_issue(project, states["Ready for Test"], "A")
        b = make_issue(project, states["In Testing"], "B")
        release = plan(project, [a, b])

        response = ship(api_key_client, workspace, [key(a), "NOPE-1", f"SHP-{b.sequence_id + 100}"])
        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["results"] == [
            {
                "key": key(a),
                "issue_id": str(a.id),
                "release_id": str(release.id),
                "moved": True,
                "unplanned": False,
                "already": False,
            }
        ]
        assert set(response.data["unknown"]) == {"NOPE-1", f"SHP-{b.sequence_id + 100}"}
        a.refresh_from_db()
        assert a.state_id == states["Released"].id and a.completed_at is not None
        release.refresh_from_db()
        assert release.status == ReleaseStatus.PLANNING

        response = ship(api_key_client, workspace, [key(b).lower()])
        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["results"][0]["release_id"] == str(release.id)
        assert response.data["results"][0]["moved"] is True
        b.refresh_from_db()
        assert b.state_id == states["Released"].id
        release.refresh_from_db()
        assert release.status == ReleaseStatus.RELEASED
        assert release.released_at is not None
        link = ReleaseIssue.objects.get(release=release, issue=b)
        assert link.shipped_via == VIA and link.previous_state_id == states["In Testing"].id

    @pytest.mark.django_db
    def test_second_unplanned_ship_is_idempotent(
        self, api_key_client, workspace, project, states, mocker, django_capture_on_commit_callbacks
    ):
        dispatch = mocker.patch("plane.utils.releases.issue_activity.delay")
        a = make_issue(project, states["Ready for Test"])
        with django_capture_on_commit_callbacks(execute=True):
            ship(api_key_client, workspace, [key(a)])
        dispatch.assert_called_once()
        assert dispatch.call_args.kwargs["type"] == "issue.activity.updated"
        a.refresh_from_db()
        updated_at, completed_at = a.updated_at, a.completed_at
        dispatch.reset_mock()

        with django_capture_on_commit_callbacks(execute=True):
            response = ship(api_key_client, workspace, [key(a)])
        assert response.status_code == status.HTTP_200_OK
        assert response.data["results"] == [
            {
                "key": key(a),
                "issue_id": str(a.id),
                "release_id": None,
                "moved": False,
                "unplanned": True,
                "already": True,
            }
        ]
        a.refresh_from_db()
        assert (a.updated_at, a.completed_at) == (updated_at, completed_at)
        assert not Release.objects.filter(project=project).exists()
        assert not ReleaseIssue.objects.filter(project=project).exists()
        dispatch.assert_not_called()

    @pytest.mark.django_db
    def test_planned_ship_replay_preserves_the_link(self, api_key_client, workspace, project, states):
        a = make_issue(project, states["Ready for Test"], "A")
        b = make_issue(project, states["In Testing"], "B")
        release = plan(project, [a, b])
        ship(api_key_client, workspace, [key(a)])
        link = ReleaseIssue.objects.get(issue=a)
        shipped_at = link.shipped_at

        response = ship(api_key_client, workspace, [key(a)])
        assert response.status_code == status.HTTP_200_OK, response.data
        result = response.data["results"][0]
        assert result["release_id"] == str(release.id)
        assert result["already"] is True and result["moved"] is False
        link.refresh_from_db()
        assert link.shipped_at == shipped_at
        release.refresh_from_db()
        assert release.status == ReleaseStatus.PLANNING
        assert Release.objects.filter(project=project).count() == 1
        assert ReleaseIssue.objects.filter(project=project).count() == 2

    @pytest.mark.django_db
    def test_same_via_replay_without_an_open_release_keeps_the_shipped_link(
        self, api_key_client, workspace, project, states
    ):
        a = make_issue(project, states["In Testing"])
        release = plan(project, [a])
        ship(api_key_client, workspace, [key(a)])
        # Preserve the legacy replay check even for a shipped link in a non-Released release.
        Release.objects.filter(pk=release.pk).update(status=ReleaseStatus.ROLLED_BACK)
        Issue.objects.filter(pk=a.pk).update(state=states["In Testing"])

        response = ship(api_key_client, workspace, [key(a)])
        assert response.status_code == status.HTTP_200_OK, response.data
        result = response.data["results"][0]
        assert result["release_id"] == str(release.id)
        assert result["already"] is True and result["moved"] is False
        a.refresh_from_db()
        assert a.state_id == states["In Testing"].id
        assert Release.objects.filter(project=project).count() == 1
        assert ReleaseIssue.objects.filter(project=project).count() == 1

    @pytest.mark.django_db
    def test_item_from_a_closed_release_shipped_by_another_repo_is_already(
        self, api_key_client, workspace, project, states
    ):
        # GAM work ships backend first, admin later: the second promotion must still report
        # the original shipped release once it has closed.
        a = make_issue(project, states["Ready for Test"], "A")
        release = plan(project, [a])
        ship(api_key_client, workspace, [key(a)])
        release.refresh_from_db()
        assert release.status == ReleaseStatus.RELEASED

        response = ship(api_key_client, workspace, [key(a)], via="github:CCI-Global-Team/cci-global-admin@def5678")
        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["results"][0]["already"] is True
        assert response.data["results"][0]["release_id"] == str(release.id)
        assert Release.objects.filter(project=project).count() == 1

    @pytest.mark.django_db
    def test_follow_up_planned_into_a_new_release_ships_there(self, api_key_client, workspace, project, states):
        a = make_issue(project, states["Ready for Test"], "A")
        october = plan(project, [a], name="October")
        ship(api_key_client, workspace, [key(a)])
        october.refresh_from_db()
        assert october.status == ReleaseStatus.RELEASED

        # QA reopens the work for a follow-up, which is planned into November.
        Issue.objects.filter(pk=a.pk).update(state=states["In Progress"])
        november = plan(project, [a], name="November")
        response = ship(api_key_client, workspace, [key(a)], via="github:CCI-Global-Team/cci-backend@fff9999")
        result = response.data["results"][0]
        assert result["release_id"] == str(november.id) and result["already"] is False and result["moved"] is True
        november.refresh_from_db()
        assert november.status == ReleaseStatus.RELEASED

    @pytest.mark.django_db
    @pytest.mark.parametrize("open_status", [None, ReleaseStatus.PLANNING, ReleaseStatus.FROZEN])
    def test_unplanned_item_moves_without_a_release(
        self, api_key_client, workspace, project, states, open_status, mocker, django_capture_on_commit_callbacks
    ):
        if open_status is not None:
            planned = make_issue(project, states["Ready for Test"], "Planned")
            release = plan(project, [planned], status_value=open_status)
        stray = make_issue(project, states["In Testing"], "Stray")
        releases_before = Release.objects.filter(project=project).count()
        links_before = ReleaseIssue.objects.filter(project=project).count()
        dispatch = mocker.patch("plane.utils.releases.issue_activity.delay")

        with django_capture_on_commit_callbacks(execute=True):
            response = ship(api_key_client, workspace, [key(stray)])
        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["results"] == [
            {
                "key": key(stray),
                "issue_id": str(stray.id),
                "release_id": None,
                "moved": True,
                "unplanned": True,
                "already": False,
            }
        ]
        stray.refresh_from_db()
        assert stray.state_id == states["Released"].id
        assert stray.completed_at is not None
        assert Release.objects.filter(project=project).count() == releases_before
        assert ReleaseIssue.objects.filter(project=project).count() == links_before
        assert not ReleaseIssue.objects.filter(issue=stray).exists()
        dispatch.assert_called_once()
        assert dispatch.call_args.kwargs["type"] == "issue.activity.updated"
        if open_status is not None:
            release.refresh_from_db()
            assert release.status == open_status
            assert ReleaseIssue.objects.get(issue=planned).shipped_at is None

    @pytest.mark.django_db
    @pytest.mark.parametrize("state_name, already", [("Done", True), ("Released", True), ("Cancelled", False)])
    def test_unplanned_completed_or_cancelled_item_is_left_alone(
        self,
        api_key_client,
        workspace,
        project,
        states,
        state_name,
        already,
        mocker,
        django_capture_on_commit_callbacks,
    ):
        item = make_issue(project, states[state_name])
        dispatch = mocker.patch("plane.utils.releases.issue_activity.delay")
        updated_at, completed_at = item.updated_at, item.completed_at

        with django_capture_on_commit_callbacks(execute=True):
            response = ship(api_key_client, workspace, [key(item)])
        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["results"] == [
            {
                "key": key(item),
                "issue_id": str(item.id),
                "release_id": None,
                "moved": False,
                "unplanned": True,
                "already": already,
            }
        ]
        item.refresh_from_db()
        assert item.state_id == states[state_name].id
        assert (item.updated_at, item.completed_at) == (updated_at, completed_at)
        assert not Release.objects.filter(project=project).exists()
        assert not ReleaseIssue.objects.filter(project=project).exists()
        dispatch.assert_not_called()

    @pytest.mark.django_db
    def test_done_item_is_recorded_but_not_moved(self, api_key_client, workspace, project, states):
        done = make_issue(project, states["Done"])
        plan(project, [done])

        result = ship(api_key_client, workspace, [key(done)]).data["results"][0]
        assert result["moved"] is False and result["already"] is False
        done.refresh_from_db()
        assert done.state_id == states["Done"].id

    @pytest.mark.django_db
    def test_keys_outside_the_callers_projects_are_unknown(self, api_key_client, workspace, project, states):
        uid = uuid4().hex[:8]
        stranger = User.objects.create(email=f"stranger-{uid}@plane.so", username=f"stranger_{uid}")
        hidden_project, hidden_states = build_project(workspace, stranger, identifier="HID")
        hidden = make_issue(hidden_project, hidden_states["Ready for Test"])

        response = ship(api_key_client, workspace, [f"HID-{hidden.sequence_id}"])
        assert response.data == {"results": [], "unknown": [f"HID-{hidden.sequence_id}"]}
        hidden.refresh_from_db()
        assert hidden.state_id == hidden_states["Ready for Test"].id

    @pytest.mark.django_db
    def test_rejects_bad_payload(self, api_key_client, workspace, project):
        assert ship(api_key_client, workspace, []).status_code == status.HTTP_400_BAD_REQUEST
        assert ship(api_key_client, workspace, "SHP-1").status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_requires_api_key(self, api_client, workspace, project):
        assert ship(api_client, workspace, ["SHP-1"]).status_code == status.HTTP_401_UNAUTHORIZED

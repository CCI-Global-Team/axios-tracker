# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: contract tests for POST /api/v1/workspaces/<slug>/releases/ship/ (GAM-400)."""

from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework import status

from plane.db.models import Release, ReleaseIssue, ReleaseStatus, User
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

        ship(api_key_client, workspace, [key(b).lower()])
        release.refresh_from_db()
        assert release.status == ReleaseStatus.RELEASED
        assert release.released_at is not None
        link = ReleaseIssue.objects.get(release=release, issue=b)
        assert link.shipped_via == VIA and link.previous_state_id == states["In Testing"].id

    @pytest.mark.django_db
    def test_second_ship_is_idempotent(self, api_key_client, workspace, project, states):
        a = make_issue(project, states["Ready for Test"])
        ship(api_key_client, workspace, [key(a)])
        releases_before = Release.objects.count()

        response = ship(api_key_client, workspace, [key(a)])
        assert response.status_code == status.HTTP_200_OK
        assert response.data["results"][0]["already"] is True
        assert response.data["results"][0]["moved"] is False
        assert Release.objects.count() == releases_before
        assert ReleaseIssue.objects.filter(issue=a).count() == 1

    @pytest.mark.django_db
    def test_unplanned_item_joins_open_release_preferring_frozen(self, api_key_client, workspace, project, states):
        planned = make_issue(project, states["Ready for Test"], "Planned")
        stray = make_issue(project, states["In Testing"], "Stray")
        plan(project, [planned], name="Planning one")
        frozen = plan(project, [], name="Frozen one", status_value=ReleaseStatus.FROZEN)

        result = ship(api_key_client, workspace, [key(stray)]).data["results"][0]
        assert result["unplanned"] is True
        assert result["release_id"] == str(frozen.id)
        assert ReleaseIssue.objects.get(issue=stray).is_unplanned is True
        stray.refresh_from_db()
        assert stray.state_id == states["Released"].id

    @pytest.mark.django_db
    def test_unplanned_item_creates_a_release_when_none_open(
        self, api_key_client, workspace, project, states, create_user
    ):
        stray = make_issue(project, states["In Testing"])

        result = ship(api_key_client, workspace, [key(stray)]).data["results"][0]
        release = Release.objects.get(pk=result["release_id"])
        assert release.name == f"Shipped {timezone.now().date().isoformat()}"
        assert release.owned_by_id == create_user.id
        # Its only item has shipped, so it closes straight away.
        assert release.status == ReleaseStatus.RELEASED

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

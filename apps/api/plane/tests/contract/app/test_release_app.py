# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: contract tests for the web app's release endpoints (GAM-400)."""

import importlib
from uuid import uuid4

import pytest
from django.apps import apps
from rest_framework import status

from plane.db.models import (
    DEFAULT_RELEASE_CHECKLIST,
    Issue,
    Project,
    ProjectMember,
    Release,
    ReleaseIssue,
    State,
    User,
    WorkspaceMember,
)
from plane.tests.contract.release_helpers import build_project, make_issue


@pytest.fixture
def project_and_states(db, workspace, create_user):
    return build_project(workspace, create_user)


@pytest.fixture
def project(project_and_states):
    return project_and_states[0]


@pytest.fixture
def states(project_and_states):
    return project_and_states[1]


def base(workspace, project):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}"


def create_release(client, workspace, project, name="R1", **extra):
    response = client.post(f"{base(workspace, project)}/releases/", {"name": name, **extra}, format="json")
    assert response.status_code == status.HTTP_201_CREATED, response.data
    return response.json()


def add(client, workspace, project, release_id, issues):
    return client.post(
        f"{base(workspace, project)}/releases/{release_id}/issues/",
        {"issue_ids": [str(i.id) for i in issues]},
        format="json",
    )


@pytest.mark.contract
class TestReleaseApp:
    @pytest.mark.django_db
    def test_create_release_has_default_checklist(self, session_client, workspace, project):
        data = create_release(session_client, workspace, project, version="1.2.0")

        assert data["status"] == "planning"
        assert data["version"] == "1.2.0"
        assert [item["text"] for item in data["checklist"]] == DEFAULT_RELEASE_CHECKLIST
        assert all(item["done"] is False and item["id"] for item in data["checklist"])
        assert data["total_items"] == 0

    @pytest.mark.django_db
    def test_duplicate_name_is_rejected(self, session_client, workspace, project):
        create_release(session_client, workspace, project, name="Same")
        response = session_client.post(f"{base(workspace, project)}/releases/", {"name": "Same"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_add_items_and_conflict_with_another_open_release(self, session_client, workspace, project, states):
        a = make_issue(project, states["Ready for Test"], "A")
        b = make_issue(project, states["In Testing"], "B")
        first = create_release(session_client, workspace, project, name="First")
        second = create_release(session_client, workspace, project, name="Second")

        response = add(session_client, workspace, project, first["id"], [a, b])
        assert response.status_code == status.HTTP_201_CREATED
        assert set(response.data["added"]) == {str(a.id), str(b.id)}

        response = add(session_client, workspace, project, second["id"], [a])
        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["issue_ids"] == [str(a.id)]
        assert not ReleaseIssue.objects.filter(release_id=second["id"]).exists()

        listing = session_client.get(f"{base(workspace, project)}/releases/").data
        counts = {r["name"]: (r["total_items"], r["ready_items"], r["shipped_items"]) for r in listing}
        assert counts["First"] == (2, 2, 0)

        items = session_client.get(f"{base(workspace, project)}/releases/{first['id']}/issues/").data
        row = next(i for i in items if i["id"] == str(a.id))
        assert row["project_identifier"] == "REL"
        assert row["state"]["name"] == "Ready for Test"
        assert row["shipped_at"] is None and row["is_unplanned"] is False

    @pytest.mark.django_db
    def test_remove_item(self, session_client, workspace, project, states):
        a = make_issue(project, states["Ready for Test"])
        release = create_release(session_client, workspace, project)
        add(session_client, workspace, project, release["id"], [a])

        response = session_client.delete(f"{base(workspace, project)}/releases/{release['id']}/issues/{a.id}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ReleaseIssue.objects.filter(release_id=release["id"]).exists()

    @pytest.mark.django_db
    def test_mark_released_moves_items_and_leaves_done_alone(self, session_client, workspace, project, states):
        ready = make_issue(project, states["Ready for Test"], "Ready")
        done = make_issue(project, states["Done"], "Done already")
        release = create_release(session_client, workspace, project)
        add(session_client, workspace, project, release["id"], [ready, done])

        response = session_client.post(f"{base(workspace, project)}/releases/{release['id']}/mark-released/")
        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["release"]["status"] == "released"
        assert response.data["release"]["shipped_items"] == 2

        ready.refresh_from_db()
        done.refresh_from_db()
        assert ready.state_id == states["Released"].id
        assert ready.completed_at is not None
        assert done.state_id == states["Done"].id
        link = ReleaseIssue.objects.get(release_id=release["id"], issue=ready)
        assert link.previous_state_id == states["Ready for Test"].id
        assert link.shipped_via == "manual"

        # Released and Rolled back are reached only through the actions.
        response = session_client.patch(
            f"{base(workspace, project)}/releases/{release['id']}/", {"status": "planning"}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_reopen_restores_previous_state_and_leaves_qa_moves(self, session_client, workspace, project, states):
        testing = make_issue(project, states["In Testing"], "Testing")
        confirmed = make_issue(project, states["Ready for Test"], "Confirmed by QA")
        release = create_release(session_client, workspace, project)
        add(session_client, workspace, project, release["id"], [testing, confirmed])
        session_client.post(f"{base(workspace, project)}/releases/{release['id']}/mark-released/")
        # QA confirms one item on production and moves it on by hand.
        Issue.objects.filter(pk=confirmed.pk).update(state=states["Done"])

        response = session_client.post(f"{base(workspace, project)}/releases/{release['id']}/reopen/")
        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["status"] == "frozen"
        assert [r["issue_id"] for r in response.data["restored"]] == [str(testing.id)]
        assert [r["issue_id"] for r in response.data["left_alone"]] == [str(confirmed.id)]

        testing.refresh_from_db()
        confirmed.refresh_from_db()
        assert testing.state_id == states["In Testing"].id
        assert testing.completed_at is None
        assert confirmed.state_id == states["Done"].id
        assert Release.objects.get(pk=release["id"]).released_at is None
        assert ReleaseIssue.objects.get(release_id=release["id"], issue=testing).shipped_at is None

    @pytest.mark.django_db
    def test_roll_back_moves_to_ready_for_test(self, session_client, workspace, project, states):
        testing = make_issue(project, states["In Testing"])
        release = create_release(session_client, workspace, project)
        add(session_client, workspace, project, release["id"], [testing])
        session_client.post(f"{base(workspace, project)}/releases/{release['id']}/mark-released/")

        response = session_client.post(f"{base(workspace, project)}/releases/{release['id']}/roll-back/")
        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["status"] == "rolled_back"
        testing.refresh_from_db()
        assert testing.state_id == states["Ready for Test"].id
        # Still linked, but the release is no longer open so the item may join another.
        other = create_release(session_client, workspace, project, name="Next")
        assert add(session_client, workspace, project, other["id"], [testing]).status_code == status.HTTP_201_CREATED

    @pytest.mark.django_db
    def test_roll_back_requires_released(self, session_client, workspace, project):
        release = create_release(session_client, workspace, project)
        response = session_client.post(f"{base(workspace, project)}/releases/{release['id']}/roll-back/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_candidates_and_search(self, session_client, workspace, project, states):
        early = make_issue(project, states["In Progress"], "Early work")
        ready = make_issue(project, states["Ready for Test"], "Ready work")
        testing = make_issue(project, states["In Testing"], "Testing work")
        planned = make_issue(project, states["In Testing"], "Planned work")
        release = create_release(session_client, workspace, project)
        add(session_client, workspace, project, release["id"], [planned])

        data = session_client.get(f"{base(workspace, project)}/release-candidates/").data
        assert {c["id"] for c in data} == {str(ready.id), str(testing.id)}

        data = session_client.get(f"{base(workspace, project)}/release-candidates/?search=work").data
        by_id = {c["id"]: c for c in data}
        assert str(early.id) in by_id
        assert by_id[str(planned.id)]["open_release_id"] == release["id"]

        data = session_client.get(f"{base(workspace, project)}/release-candidates/?search=REL-{early.sequence_id}").data
        assert [c["id"] for c in data] == [str(early.id)]

    @pytest.mark.django_db
    def test_issue_release_link(self, session_client, workspace, project, states):
        item = make_issue(project, states["Ready for Test"])
        url = f"{base(workspace, project)}/issues/{item.id}/release/"
        assert session_client.get(url).data is None

        release = create_release(session_client, workspace, project, name="Linked")
        add(session_client, workspace, project, release["id"], [item])
        data = session_client.get(url).data
        assert data["id"] == release["id"] and data["name"] == "Linked" and data["status"] == "planning"

    @pytest.mark.django_db
    def test_checklist_ticks_are_stamped(self, session_client, workspace, project, create_user):
        release = create_release(session_client, workspace, project)
        checklist = release["checklist"]
        checklist[0]["done"] = True
        response = session_client.patch(
            f"{base(workspace, project)}/releases/{release['id']}/", {"checklist": checklist}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        first = response.data["checklist"][0]
        assert first["done"] is True and first["done_by"] == str(create_user.id) and first["done_at"]


@pytest.mark.contract
class TestReleaseGuestAccess:
    @pytest.fixture
    def guest_client(self, api_client, workspace, project):
        uid = uuid4().hex[:8]
        guest = User.objects.create(email=f"guest-{uid}@plane.so", username=f"guest_{uid}")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProjectMember.objects.create(workspace=workspace, project=project, member=guest, role=5, is_active=True)
        api_client.force_authenticate(user=guest)
        return api_client

    @pytest.mark.django_db
    def test_guest_can_read_but_not_write(self, guest_client, workspace, project, states):
        release = Release.objects.create(name="Read only", project=project, workspace=workspace)
        item = make_issue(project, states["Ready for Test"])

        assert guest_client.get(f"{base(workspace, project)}/releases/").status_code == status.HTTP_200_OK
        assert (
            guest_client.post(f"{base(workspace, project)}/releases/", {"name": "x"}, format="json").status_code
            == status.HTTP_403_FORBIDDEN
        )
        assert add(guest_client, workspace, project, release.id, [item]).status_code == status.HTTP_403_FORBIDDEN
        assert (
            guest_client.post(f"{base(workspace, project)}/releases/{release.id}/mark-released/").status_code
            == status.HTTP_403_FORBIDDEN
        )


@pytest.mark.contract
class TestReleasedStateMigration:
    @pytest.mark.django_db
    def test_adds_released_once_per_project(self, workspace, create_user):
        migration = importlib.import_module("plane.db.migrations.0130_released_state")
        plain = Project.objects.create(name="Plain", identifier="PLN", workspace=workspace)
        State.objects.create(name="Todo", group="unstarted", project=plain, workspace=workspace)
        crowded = Project.objects.create(name="Crowded", identifier="CRW", workspace=workspace)
        State.objects.bulk_create(
            [State(name="Shipping", group="started", sequence=40000, project=crowded, workspace=workspace)]
        )
        has_it = Project.objects.create(name="Has it", identifier="HAS", workspace=workspace)
        State.objects.create(name="released", group="completed", project=has_it, workspace=workspace)

        migration.add_released_state(apps, None)
        migration.add_released_state(apps, None)

        plain_released = State.objects.get(project=plain, name="Released")
        assert (plain_released.group, plain_released.sequence, plain_released.color) == ("completed", 40000, "#0EA5E9")
        assert State.objects.get(project=crowded, name="Released").sequence == 44000
        assert State.objects.filter(project=has_it, name__iexact="released").count() == 1

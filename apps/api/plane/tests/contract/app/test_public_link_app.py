# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: contract tests for creating, listing and revoking work item share links (GAM-401)."""

from unittest import mock
from uuid import uuid4

import pytest
from rest_framework import status

from plane.db.models import ProjectMember, User, WorkItemPublicLink, WorkspaceMember
from plane.tests.contract.release_helpers import build_project, make_issue

ORIGIN = "https://axios.example.test"


@pytest.fixture(autouse=True)
def app_origin(settings):
    settings.APP_BASE_URL = ORIGIN
    settings.WEB_URL = ORIGIN


@pytest.fixture(autouse=True)
def activity():
    with mock.patch("plane.app.views.issue.public_link.issue_activity") as task:
        yield task


@pytest.fixture
def project_and_states(db, workspace, create_user):
    return build_project(workspace, create_user, identifier="GAM")


@pytest.fixture
def project(project_and_states):
    return project_and_states[0]


@pytest.fixture
def issue(project_and_states):
    project, states = project_and_states
    return make_issue(project, states["In Progress"], "Share me")


def links_url(workspace, project, issue):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/public-links/"


@pytest.mark.contract
class TestPublicLinkApp:
    @pytest.mark.django_db
    def test_create_returns_share_url(self, session_client, workspace, project, issue, create_user, activity):
        response = session_client.post(
            links_url(workspace, project, issue), {"include_description": True}, format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED, response.data
        data = response.data
        assert set(data) == {"id", "token", "url", "include_description", "created_at", "created_by", "revoked_at"}
        assert len(data["token"]) >= 20
        assert data["url"] == f"{ORIGIN}/s/{data['token']}"
        assert data["include_description"] is True
        assert data["created_by"] == str(create_user.id)
        assert data["revoked_at"] is None
        link = WorkItemPublicLink.objects.get(pk=data["id"])
        assert link.issue_id == issue.id and link.workspace_id == workspace.id
        assert activity.delay.call_args.kwargs["type"] == "public_link.activity.created"
        # the token must never reach the work item history
        assert data["token"] not in activity.delay.call_args.kwargs["requested_data"]

    @pytest.mark.django_db
    def test_include_description_defaults_off_and_must_be_bool(self, session_client, workspace, project, issue):
        response = session_client.post(links_url(workspace, project, issue), {}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["include_description"] is False

        response = session_client.post(
            links_url(workspace, project, issue), {"include_description": "yes"}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_tokens_are_unique_per_link(self, session_client, workspace, project, issue):
        first = session_client.post(links_url(workspace, project, issue), {}, format="json").data
        second = session_client.post(links_url(workspace, project, issue), {}, format="json").data
        assert first["token"] != second["token"]

    @pytest.mark.django_db
    def test_list_shows_live_links_newest_first(self, session_client, workspace, project, issue):
        old = session_client.post(links_url(workspace, project, issue), {}, format="json").data
        new = session_client.post(links_url(workspace, project, issue), {}, format="json").data
        revoked = session_client.post(links_url(workspace, project, issue), {}, format="json").data
        session_client.delete(f"{links_url(workspace, project, issue)}{revoked['id']}/")

        response = session_client.get(links_url(workspace, project, issue))
        assert response.status_code == status.HTTP_200_OK
        assert [link["id"] for link in response.data] == [new["id"], old["id"]]

    @pytest.mark.django_db
    def test_revoke_is_idempotent(self, session_client, workspace, project, issue, activity):
        link = session_client.post(links_url(workspace, project, issue), {}, format="json").data
        url = f"{links_url(workspace, project, issue)}{link['id']}/"

        assert session_client.delete(url).status_code == status.HTTP_204_NO_CONTENT
        revoked_at = WorkItemPublicLink.objects.get(pk=link["id"]).revoked_at
        assert revoked_at is not None
        assert activity.delay.call_args.kwargs["type"] == "public_link.activity.deleted"
        calls = activity.delay.call_count

        assert session_client.delete(url).status_code == status.HTTP_204_NO_CONTENT
        assert WorkItemPublicLink.objects.get(pk=link["id"]).revoked_at == revoked_at
        assert activity.delay.call_count == calls

    @pytest.mark.django_db
    def test_unknown_link_is_404(self, session_client, workspace, project, issue):
        response = session_client.delete(f"{links_url(workspace, project, issue)}{uuid4()}/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_issue_from_another_project_is_404(self, session_client, workspace, project, create_user):
        other_project, other_states = build_project(workspace, create_user, identifier="OTH")
        other_issue = make_issue(other_project, other_states["Backlog"], "Elsewhere")

        assert session_client.get(links_url(workspace, project, other_issue)).status_code == status.HTTP_404_NOT_FOUND
        response = session_client.post(links_url(workspace, project, other_issue), {}, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not WorkItemPublicLink.objects.exists()


@pytest.mark.contract
class TestPublicLinkGuestAccess:
    @pytest.fixture
    def guest_client(self, api_client, workspace, project):
        uid = uuid4().hex[:8]
        guest = User.objects.create(email=f"guest-{uid}@plane.so", username=f"guest_{uid}")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProjectMember.objects.create(workspace=workspace, project=project, member=guest, role=5, is_active=True)
        api_client.force_authenticate(user=guest)
        return api_client

    @pytest.mark.django_db
    def test_guest_cannot_list_create_or_revoke(self, guest_client, workspace, project, issue):
        link = WorkItemPublicLink.objects.create(issue=issue, project=project)

        assert guest_client.get(links_url(workspace, project, issue)).status_code == status.HTTP_403_FORBIDDEN
        response = guest_client.post(links_url(workspace, project, issue), {}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        response = guest_client.delete(f"{links_url(workspace, project, issue)}{link.id}/")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        link.refresh_from_db()
        assert link.revoked_at is None

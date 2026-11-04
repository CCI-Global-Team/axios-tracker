# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: GAM-736 - API keys can't delete work items, projects, states, cycles, labels, modules or intake items."""

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.api.views.base import API_KEY_DELETE_BLOCKED
from plane.db.models import (
    Cycle,
    CycleIssue,
    Intake,
    IntakeIssue,
    Issue,
    IssueComment,
    IssueLink,
    Label,
    Module,
    ModuleIssue,
    Project,
    State,
)
from plane.tests.contract.release_helpers import build_project, make_issue


@pytest.fixture
def setup(db, workspace, create_user):
    project, states = build_project(workspace, create_user, identifier="DEL")
    Project.objects.filter(pk=project.pk).update(cycle_view=True, module_view=True, intake_view=True)
    issue = make_issue(project, states["Backlog"])
    common = {"project": project, "workspace": workspace}
    cycle = Cycle.objects.create(name="Sprint", owned_by=create_user, **common)
    module = Module.objects.create(name="Module", **common)
    intake = Intake.objects.create(name="Intake", is_default=True, **common)
    return {
        "project": project,
        "state": states["In Testing"],
        "issue": issue,
        "cycle": cycle,
        "module": module,
        "label": Label.objects.create(name="qa", color="#ef4444", **common),
        "intake_issue": IntakeIssue.objects.create(
            intake=intake, issue=make_issue(project, states["Backlog"], "From the form"), status=-2, **common
        ),
        "cycle_issue": CycleIssue.objects.create(cycle=cycle, issue=issue, **common),
        "module_issue": ModuleIssue.objects.create(module=module, issue=issue, **common),
        "comment": IssueComment.objects.create(issue=issue, comment_html="<p>hi</p>", **common),
        "link": IssueLink.objects.create(issue=issue, url="https://example.com", **common),
    }


def base(workspace, project):
    return f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}"


BLOCKED = [
    ("work-items", lambda s: (f"/work-items/{s['issue'].id}/", Issue, s["issue"].id)),
    ("issues", lambda s: (f"/issues/{s['issue'].id}/", Issue, s["issue"].id)),
    ("states", lambda s: (f"/states/{s['state'].id}/", State, s["state"].id)),
    ("cycles", lambda s: (f"/cycles/{s['cycle'].id}/", Cycle, s["cycle"].id)),
    ("labels", lambda s: (f"/labels/{s['label'].id}/", Label, s["label"].id)),
    ("modules", lambda s: (f"/modules/{s['module'].id}/", Module, s["module"].id)),
    ("intake", lambda s: (f"/intake-issues/{s['intake_issue'].issue_id}/", Issue, s["intake_issue"].issue_id)),
]


@pytest.mark.contract
class TestApiKeyDeleteBlock:
    @pytest.mark.django_db
    @pytest.mark.parametrize("name,target", BLOCKED, ids=[name for name, _ in BLOCKED])
    def test_blocked_delete_returns_403_and_keeps_the_object(self, api_key_client, workspace, setup, name, target):
        path, model, pk = target(setup)
        response = api_key_client.delete(base(workspace, setup["project"]) + path)
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data["detail"] == API_KEY_DELETE_BLOCKED
        assert model.objects.filter(pk=pk).exists()

    @pytest.mark.django_db
    def test_project_delete_is_blocked(self, api_key_client, workspace, setup):
        project = setup["project"]
        response = api_key_client.delete(f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert Project.objects.filter(pk=project.pk).exists()

    @pytest.mark.django_db
    def test_reads_and_updates_on_blocked_views_still_work(self, api_key_client, workspace, setup):
        url = f"{base(workspace, setup['project'])}/labels/{setup['label'].id}/"
        assert api_key_client.get(url).status_code == status.HTTP_200_OK
        assert api_key_client.patch(url, {"name": "qa2"}, format="json").status_code == status.HTTP_200_OK

    @pytest.mark.django_db
    def test_removing_items_and_deleting_comments_and_links_still_work(self, api_key_client, workspace, setup):
        s, url = setup, base(workspace, setup["project"])
        issue = s["issue"].id
        for path in [
            f"/cycles/{s['cycle'].id}/cycle-issues/{issue}/",
            f"/modules/{s['module'].id}/module-issues/{issue}/",
            f"/work-items/{issue}/comments/{s['comment'].id}/",
            f"/work-items/{issue}/links/{s['link'].id}/",
        ]:
            assert api_key_client.delete(url + path).status_code == status.HTTP_204_NO_CONTENT, path
        assert Issue.objects.filter(pk=issue).exists()

    @pytest.mark.django_db
    def test_unarchiving_a_cycle_still_works(self, api_key_client, workspace, setup):
        cycle = setup["cycle"]
        Cycle.objects.filter(pk=cycle.pk).update(archived_at=timezone.now())
        response = api_key_client.delete(f"{base(workspace, setup['project'])}/archived-cycles/{cycle.id}/unarchive/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        cycle.refresh_from_db()
        assert cycle.archived_at is None

    @pytest.mark.django_db
    def test_invalid_key_still_gets_the_auth_error(self, workspace, setup):
        client = APIClient()
        client.credentials(HTTP_X_API_KEY="not-a-key")
        response = client.delete(f"{base(workspace, setup['project'])}/labels/{setup['label'].id}/")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data["detail"] != API_KEY_DELETE_BLOCKED

    @pytest.mark.django_db
    def test_web_app_delete_is_unaffected(self, session_client, workspace, setup):
        label = setup["label"]
        project = setup["project"]
        response = session_client.delete(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-labels/{label.id}/"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Label.objects.filter(pk=label.pk).exists()

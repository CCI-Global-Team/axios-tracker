# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: GAM-572 - idempotent, backdatable intake create on the public API."""

from datetime import datetime, timezone
from unittest import mock

import pytest
from rest_framework import status

from plane.db.models import Intake, IntakeIssue, Issue, Project, ProjectMember


@pytest.fixture
def intake_project(db, workspace, create_user):
    project = Project.objects.create(
        name="Mobile", identifier="MOB", workspace=workspace, created_by=create_user, intake_view=True
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    Intake.objects.create(name=f"{project.name} Intake", project=project, is_default=True)
    return project


@pytest.fixture(autouse=True)
def no_activity():
    with mock.patch("plane.api.views.intake.issue_activity") as task:
        yield task


def url(workspace, project):
    return f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/intake-issues/"


def payload(**extra):
    return {"issue": {"name": "Help: app crashes", "description_html": "<p>hi</p>", **extra}}


@pytest.mark.contract
class TestIntakeExternalIds:
    def test_create_with_external_ids_stores_them(self, api_key_client, workspace, intake_project):
        res = api_key_client.post(
            url(workspace, intake_project),
            payload(external_source="gravity-forms", external_id="48-95489"),
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED
        issue = Issue.objects.get(project=intake_project)
        assert issue.external_source == "gravity-forms"
        assert issue.external_id == "48-95489"
        assert IntakeIssue.objects.filter(issue=issue).count() == 1

    def test_same_external_ids_again_returns_409_and_creates_nothing(self, api_key_client, workspace, intake_project):
        body = payload(external_source="gravity-forms", external_id="48-95489")
        first = api_key_client.post(url(workspace, intake_project), body, format="json")
        assert first.status_code == status.HTTP_201_CREATED

        again = api_key_client.post(url(workspace, intake_project), body, format="json")
        assert again.status_code == status.HTTP_409_CONFLICT
        issue = Issue.objects.get(project=intake_project)
        intake_issue = IntakeIssue.objects.get(issue=issue)
        assert again.data["id"] == str(intake_issue.id)
        assert again.data["issue_id"] == str(issue.id)
        assert Issue.objects.filter(project=intake_project).count() == 1
        assert IntakeIssue.objects.filter(project=intake_project).count() == 1

    def test_deleted_issue_does_not_block_recreate(self, api_key_client, workspace, intake_project):
        body = payload(external_source="gravity-forms", external_id="48-1")
        assert api_key_client.post(url(workspace, intake_project), body, format="json").status_code == 201
        Issue.objects.filter(project=intake_project).update(deleted_at=datetime.now(timezone.utc))

        res = api_key_client.post(url(workspace, intake_project), body, format="json")
        assert res.status_code == status.HTTP_201_CREATED

    def test_created_at_is_backdated(self, api_key_client, workspace, intake_project):
        res = api_key_client.post(
            url(workspace, intake_project),
            payload(external_source="gravity-forms", external_id="48-2", created_at="2026-08-02T07:39:28Z"),
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED
        expected = datetime(2026, 8, 2, 7, 39, 28, tzinfo=timezone.utc)
        issue = Issue.objects.get(project=intake_project)
        assert issue.created_at == expected
        assert IntakeIssue.objects.get(issue=issue).created_at == expected

    def test_bad_created_at_is_400_and_creates_nothing(self, api_key_client, workspace, intake_project):
        res = api_key_client.post(url(workspace, intake_project), payload(created_at="last tuesday"), format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert Issue.objects.filter(project=intake_project).count() == 0

    def test_without_external_ids_keeps_old_behaviour(self, api_key_client, workspace, intake_project):
        for _ in range(2):
            res = api_key_client.post(url(workspace, intake_project), payload(), format="json")
            assert res.status_code == status.HTTP_201_CREATED
        issues = Issue.objects.filter(project=intake_project)
        assert issues.count() == 2
        assert all(i.external_source is None and i.external_id is None for i in issues)

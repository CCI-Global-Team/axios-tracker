# ruff: noqa: F811
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.utils import timezone

from plane.db.models import IntakeIssue, Issue, IssueLabel, Label

# Imported pytest fixtures are injected by name.
from plane.tests.contract.api.test_intake_external import intake_project  # noqa: F401
from plane.utils.intake_campus import campus_label

pytestmark = pytest.mark.contract


@pytest.fixture
def seeded(workspace, intake_project):
    campuses = [campus_label(intake_project.id, workspace.id, name) for name in ["Ikeja", "Abuja"]]
    ordinary = Label.objects.create(project=intake_project, workspace=workspace, name="Bug")
    items = []
    for index, campus in enumerate([campuses[0], campuses[0], campuses[1], None]):
        issue = Issue.objects.create(name=f"Support {index}", project=intake_project, workspace=workspace)
        item = IntakeIssue.objects.create(
            intake=intake_project.project_intake.first(),
            issue=issue,
            project=intake_project,
            workspace=workspace,
            status=0 if index == 1 else -2,
        )
        for label in [campus, ordinary if index in [0, 2, 3] else None]:
            if label:
                IssueLabel.objects.create(issue=issue, label=label, project=intake_project, workspace=workspace)
        items.append(item)
    return campuses, ordinary, items


def get_ids(client, workspace, project, **params):
    response = client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/intake-issues/", params)
    assert response.status_code == 200, response.data
    return {str(row["id"]) for row in response.data["results"]}


def test_campus_and_labels_and_status(session_client, workspace, intake_project, seeded):
    campuses, ordinary, items = seeded

    def ids(*indices):
        return {str(items[index].id) for index in indices}

    assert get_ids(session_client, workspace, intake_project, campus=str(campuses[0].id)) == ids(0)
    assert get_ids(session_client, workspace, intake_project, campus=str(campuses[0].id), status="-2,0") == ids(0, 1)
    assert get_ids(session_client, workspace, intake_project, campus=",".join(str(c.id) for c in campuses)) == ids(0, 2)
    assert get_ids(
        session_client, workspace, intake_project, campus=str(campuses[0].id), labels=str(ordinary.id), status="-2,0"
    ) == ids(0)
    assert get_ids(session_client, workspace, intake_project, campus="null, ,") == ids(0, 2, 3)


def test_bad_campus_uuid(session_client, workspace, intake_project):
    response = session_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{intake_project.id}/intake-issues/", {"campus": "bad-id"}
    )
    assert response.status_code == 400


def test_deleted_campus_link_is_excluded(session_client, workspace, intake_project, seeded):
    campuses, _, items = seeded
    IssueLabel.objects.filter(issue=items[0].issue, label=campuses[0]).update(deleted_at=timezone.now())
    assert get_ids(session_client, workspace, intake_project, campus=str(campuses[0].id)) == set()


def test_campus_pagination(session_client, workspace, intake_project, seeded):
    campuses, _, items = seeded
    url = f"/api/workspaces/{workspace.slug}/projects/{intake_project.id}/intake-issues/"
    params = {"campus": ",".join(str(label.id) for label in campuses), "per_page": 1}
    first = session_client.get(url, params)
    assert first.status_code == 200
    assert len(first.data["results"]) == 1
    assert first.data["next_page_results"]
    second = session_client.get(url, {**params, "cursor": first.data["next_cursor"]})
    assert second.status_code == 200
    assert len(second.data["results"]) == 1
    assert not second.data["next_page_results"]
    assert {str(first.data["results"][0]["id"]), str(second.data["results"][0]["id"])} == {
        str(items[0].id),
        str(items[2].id),
    }

# ruff: noqa: F811
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models import Issue, IssueLabel, Label

# Imported pytest fixtures are injected by name.
from plane.tests.contract.api.test_intake_external import intake_project, no_activity, payload, url  # noqa: F401

pytestmark = pytest.mark.contract


def test_create_reuses_campus(api_key_client, workspace, intake_project):
    for campus in ["Ikeja, Lagos", "  iKEJA, lAGOS  "]:
        response = api_key_client.post(url(workspace, intake_project), payload(campus=campus), format="json")
        assert response.status_code == 201
    parent = Label.objects.get(project=intake_project, name="Campus", parent=None)
    label = Label.objects.get(project=intake_project, parent=parent)
    assert label.name == "Ikeja, Lagos"
    assert IssueLabel.objects.filter(label=label, workspace=workspace, project=intake_project).count() == 2
    assert Label.objects.filter(project=intake_project).count() == 2


@pytest.mark.parametrize("extra", [{}, {"campus": ""}, {"campus": "   "}])
def test_empty_campus(api_key_client, workspace, intake_project, extra):
    assert api_key_client.post(url(workspace, intake_project), payload(**extra), format="json").status_code == 201
    assert not IssueLabel.objects.exists()
    assert not Label.objects.exists()


@pytest.mark.parametrize("campus", [None, 42, [], {}])
def test_non_string_campus(api_key_client, workspace, intake_project, campus):
    response = api_key_client.post(url(workspace, intake_project), payload(campus=campus), format="json")
    assert response.status_code == 400
    assert not Issue.objects.filter(project=intake_project).exists()


def test_existing_project_label_is_reused_where_it_is(api_key_client, workspace, intake_project):
    label = Label.objects.create(project=intake_project, workspace=workspace, name="Online")
    assert (
        api_key_client.post(url(workspace, intake_project), payload(campus="online"), format="json").status_code == 201
    )
    label.refresh_from_db()
    assert label.parent is None
    assert IssueLabel.objects.get().label == label


def test_reserved_campus_name(api_key_client, workspace, intake_project):
    response = api_key_client.post(url(workspace, intake_project), payload(campus=" campus "), format="json")
    assert response.status_code == 400
    assert not Issue.objects.exists()
    assert not Label.objects.exists()

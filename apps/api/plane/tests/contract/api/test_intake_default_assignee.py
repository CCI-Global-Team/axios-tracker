# ruff: noqa: F811
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: support requests filed through the public API get the project's default assignee."""

import json
from unittest import mock

import pytest

from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import IssueAssignee, IssueSubscriber, ProjectMember, User

# Imported pytest fixtures are injected by name.
from plane.tests.contract.api.test_intake_external import intake_project, no_activity, payload, url  # noqa: F401

pytestmark = pytest.mark.contract


@pytest.fixture
def triager(workspace, intake_project):
    user = User.objects.create(email="triager@example.test", username="triager", first_name="Tola")
    ProjectMember.objects.create(project=intake_project, member=user, role=15, is_active=True)
    intake_project.default_assignee = user
    intake_project.save(update_fields=["default_assignee"])
    return user


def test_request_goes_to_default_assignee(api_key_client, workspace, intake_project, triager, no_activity):
    response = api_key_client.post(url(workspace, intake_project), payload(), format="json")
    assert response.status_code == 201
    assert list(IssueAssignee.objects.values_list("assignee_id", flat=True)) == [triager.id]

    kwargs = no_activity.delay.call_args.kwargs
    assert json.loads(kwargs["requested_data"])["assignee_ids"] == [str(triager.id)]
    assert kwargs["notification"] is True
    assert kwargs["subscriber"] is False


def test_activity_emails_and_subscribes_the_assignee(api_key_client, workspace, intake_project, triager, no_activity):
    api_key_client.post(url(workspace, intake_project), payload(), format="json")
    kwargs = no_activity.delay.call_args.kwargs

    with (
        mock.patch("plane.bgtasks.issue_activities_task.send_assignment_email") as email,
        mock.patch("plane.bgtasks.issue_activities_task.notifications"),
    ):
        issue_activity(**kwargs)

    email.delay.assert_called_once_with(
        issue_id=kwargs["issue_id"], assignee_id=str(triager.id), actor_id=kwargs["actor_id"]
    )
    assert IssueSubscriber.objects.filter(subscriber=triager).exists()


def test_no_default_assignee_leaves_it_unassigned(api_key_client, workspace, intake_project, no_activity):
    assert api_key_client.post(url(workspace, intake_project), payload(), format="json").status_code == 201
    assert not IssueAssignee.objects.exists()
    assert json.loads(no_activity.delay.call_args.kwargs["requested_data"])["assignee_ids"] == []


@pytest.mark.parametrize("change", [{"is_active": False}, {"role": 5}])
def test_default_assignee_who_cannot_work_on_it_is_skipped(api_key_client, workspace, intake_project, triager, change):
    ProjectMember.objects.filter(project=intake_project, member=triager).update(**change)
    assert api_key_client.post(url(workspace, intake_project), payload(), format="json").status_code == 201
    assert not IssueAssignee.objects.exists()


def test_replayed_request_is_not_assigned_twice(api_key_client, workspace, intake_project, triager):
    body = payload(external_source="gravity-forms", external_id="48-1")
    assert api_key_client.post(url(workspace, intake_project), body, format="json").status_code == 201
    assert api_key_client.post(url(workspace, intake_project), body, format="json").status_code == 409
    assert IssueAssignee.objects.count() == 1

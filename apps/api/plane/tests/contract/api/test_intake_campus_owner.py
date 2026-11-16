# ruff: noqa: F811
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
from io import StringIO
from unittest import mock

import pytest
from django.core.management import call_command
from django.utils import timezone

from plane.db.models import Intake, IntakeIssue, Issue, IssueAssignee, IssueLabel, ProjectMember, User
from plane.tests.contract.api.test_intake_external import intake_project, no_activity, payload, url  # noqa: F401
from plane.utils.intake_campus import campus_label

pytestmark = pytest.mark.contract


@pytest.fixture
def owner(workspace, intake_project):
    user = User.objects.create(email="campus-owner@example.test", username="campus-owner", display_name="Campus Owner")
    ProjectMember.objects.create(project=intake_project, member=user, role=15, is_active=True)
    return user


@pytest.fixture
def owned_campus(workspace, intake_project, owner):
    label = campus_label(intake_project.id, workspace.id, "Ikeja")
    label.default_assignee = owner
    label.save(update_fields=["default_assignee"])
    return label


@pytest.fixture
def project_default(workspace, intake_project):
    user = User.objects.create(email="project-default@example.test", username="project-default")
    ProjectMember.objects.create(project=intake_project, member=user, role=20, is_active=True)
    intake_project.default_assignee = user
    intake_project.save(update_fields=["default_assignee"])
    return user


def test_campus_owner_takes_precedence(
    api_key_client, workspace, intake_project, owner, owned_campus, project_default, no_activity
):
    response = api_key_client.post(url(workspace, intake_project), payload(campus="Ikeja"), format="json")
    assert response.status_code == 201
    assert list(IssueAssignee.objects.values_list("assignee_id", flat=True)) == [owner.id]
    kwargs = no_activity.delay.call_args.kwargs
    assert json.loads(kwargs["requested_data"])["assignee_ids"] == [str(owner.id)]
    assert kwargs["notification"] is True
    assert kwargs["subscriber"] is False


@pytest.mark.parametrize("change", [{"is_active": False}, {"role": 5}])
@pytest.mark.parametrize("has_default", [True, False])
def test_ineligible_owner_falls_back(
    api_key_client, workspace, intake_project, owner, owned_campus, project_default, no_activity, change, has_default
):
    ProjectMember.objects.filter(project=intake_project, member=owner).update(**change)
    if not has_default:
        intake_project.default_assignee = None
        intake_project.save(update_fields=["default_assignee"])
    response = api_key_client.post(url(workspace, intake_project), payload(campus="Ikeja"), format="json")
    assert response.status_code == 201
    expected = [project_default.id] if has_default else []
    assert list(IssueAssignee.objects.values_list("assignee_id", flat=True)) == expected
    assert json.loads(no_activity.delay.call_args.kwargs["requested_data"])["assignee_ids"] == [
        str(member_id) for member_id in expected
    ]


def test_unowned_campus_uses_project_default(api_key_client, workspace, intake_project, project_default):
    response = api_key_client.post(url(workspace, intake_project), payload(campus="Abuja"), format="json")
    assert response.status_code == 201
    assert IssueAssignee.objects.get().assignee_id == project_default.id


def test_backfill_assign_dry_run_apply_and_rerun(
    workspace, intake_project, create_user, owner, owned_campus, project_default
):
    intake = Intake.objects.get(project=intake_project)
    unowned = campus_label(intake_project.id, workspace.id, "Abuja")
    issues = {}
    for name, status, label in [
        ("unassigned", -2, owned_campus),
        ("assigned", -2, owned_campus),
        ("accepted", 1, owned_campus),
        ("unowned", -2, unowned),
        ("needs-label", -2, None),
        ("deleted-assignee", -2, owned_campus),
    ]:
        issue = Issue.objects.create(
            project=intake_project,
            workspace=workspace,
            name=name,
            created_by=create_user,
            description_html="<p><strong>Campus</strong> Ikeja</p>",
        )
        # BaseModel normally replaces created_by with the current request user on save.
        Issue.objects.filter(pk=issue.pk).update(created_by=create_user)
        issues[name] = issue
        IntakeIssue.objects.create(
            issue=issue, intake=intake, project=intake_project, workspace=workspace, status=status
        )
        if label:
            IssueLabel.objects.create(issue=issue, label=label, project=intake_project, workspace=workspace)
    IssueAssignee.objects.create(
        issue=issues["assigned"], assignee=project_default, project=intake_project, workspace=workspace
    )
    IssueAssignee.objects.create(
        issue=issues["deleted-assignee"],
        assignee=owner,
        project=intake_project,
        workspace=workspace,
        deleted_at=timezone.now(),
    )
    with mock.patch("plane.db.management.commands.backfill_intake_campus_labels.issue_activity") as activity:
        output = StringIO()
        call_command("backfill_intake_campus_labels", project=intake_project.id, assign=True, stdout=output)
        assert IssueAssignee.objects.count() == 1
        assert IssueLabel.objects.count() == 5
        assert "Campus Owner: 3" in output.getvalue()
        assert "Assign dry run total: 3" in output.getvalue()
        activity.delay.assert_not_called()

        output = StringIO()
        call_command("backfill_intake_campus_labels", project=intake_project.id, assign=True, apply=True, stdout=output)
        assert "Assigned total: 3" in output.getvalue()
        assert set(IssueAssignee.objects.filter(assignee=owner).values_list("issue_id", flat=True)) == {
            issues[name].id for name in ["unassigned", "needs-label", "deleted-assignee"]
        }
        assert IssueAssignee.objects.filter(issue=issues["assigned"]).get().assignee_id == project_default.id
        assert not IssueAssignee.objects.filter(issue__in=[issues["accepted"], issues["unowned"]]).exists()
        assert IssueLabel.objects.filter(issue=issues["needs-label"], label=owned_campus).exists()
        assert activity.delay.call_count == 3
        for call in activity.delay.call_args_list:
            kwargs = call.kwargs
            assert kwargs["type"] == "issue.activity.updated"
            assert json.loads(kwargs["requested_data"]) == {"assignee_ids": [str(owner.id)]}
            assert json.loads(kwargs["current_instance"]) == {"assignee_ids": []}
            assert kwargs["actor_id"] == str(create_user.id)
            assert kwargs["project_id"] == str(intake_project.id)
            assert kwargs["notification"] is True
            assert kwargs["subscriber"] is False

        activity.reset_mock()
        output = StringIO()
        call_command("backfill_intake_campus_labels", project=intake_project.id, assign=True, apply=True, stdout=output)
        assert "Assigned total: 0" in output.getvalue()
        activity.delay.assert_not_called()


@pytest.mark.parametrize("change", [{"is_active": False}, {"role": 5}])
def test_backfill_skips_invalid_owner_even_with_project_default(
    workspace, intake_project, owner, owned_campus, project_default, change
):
    ProjectMember.objects.filter(project=intake_project, member=owner).update(**change)
    issue = Issue.objects.create(project=intake_project, workspace=workspace, name="Help")
    IntakeIssue.objects.create(
        issue=issue, intake=Intake.objects.get(project=intake_project), project=intake_project, workspace=workspace
    )
    IssueLabel.objects.create(issue=issue, label=owned_campus, project=intake_project, workspace=workspace)
    with mock.patch("plane.db.management.commands.backfill_intake_campus_labels.issue_activity") as activity:
        output = StringIO()
        call_command("backfill_intake_campus_labels", project=intake_project.id, assign=True, apply=True, stdout=output)
        assert "Assigned total: 0" in output.getvalue()
        assert not IssueAssignee.objects.exists()
        activity.delay.assert_not_called()

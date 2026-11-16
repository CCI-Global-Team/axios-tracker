# ruff: noqa: F811
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from io import StringIO

import pytest
from django.core.management import call_command

from plane.db.models import Intake, IntakeIssue, Issue, IssueLabel, Label

# Imported pytest fixtures are injected by name.
from plane.tests.contract.api.test_intake_external import intake_project  # noqa: F401
from plane.utils.intake_campus import campus_from_description, campus_label

pytestmark = pytest.mark.contract


@pytest.mark.parametrize(
    "description,expected",
    [
        ("<p><strong>Campus</strong> Montréal &amp; Laval </p><p>Other</p>", "Montréal & Laval"),
        ("<strong>Campus</strong> &nbsp; <br>", None),
        ("<p>Nothing</p>", None),
    ],
)
def test_parse_description(description, expected):
    assert campus_from_description(description) == expected


def test_backfill_dry_run_apply_and_rerun(workspace, intake_project):
    intake = Intake.objects.get(project=intake_project)
    items = []
    for text in ["Ikeja", "Ikeja", "Abuja", "", "Already labeled"]:
        issue = Issue.objects.create(
            project=intake_project,
            workspace=workspace,
            name="Help",
            description_html=f"<p><strong>Campus</strong> {text}</p>",
        )
        items.append(
            IntakeIssue.objects.create(issue=issue, intake=intake, project=intake_project, workspace=workspace)
        )
    label = campus_label(intake_project.id, workspace.id, "Existing")
    IssueLabel.objects.create(issue=items[-1].issue, label=label, project=intake_project, workspace=workspace)
    output = StringIO()
    call_command("backfill_intake_campus_labels", project=intake_project.id, stdout=output)
    assert Label.objects.count() == 2
    assert IssueLabel.objects.count() == 1
    assert "Ikeja: 2" in output.getvalue()
    assert "Dry run total: 3" in output.getvalue()
    call_command("backfill_intake_campus_labels", project=intake_project.id, apply=True)
    assert Label.objects.count() == 4
    assert IssueLabel.objects.count() == 4
    output = StringIO()
    call_command("backfill_intake_campus_labels", project=intake_project.id, apply=True, stdout=output)
    assert IssueLabel.objects.count() == 4
    assert "Applied total: 0" in output.getvalue()

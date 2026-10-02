# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: shared setup for the release contract tests (GAM-400)."""

from plane.db.models import Issue, Project, ProjectMember, State

# The CCI workflow, by sequence. State.save() renumbers new states, so these are bulk-created.
CCI_STATES = [
    ("Backlog", "backlog", 15000),
    ("In Progress", "started", 35000),
    ("Released", "completed", 40000),
    ("Done", "completed", 45000),
    ("Cancelled", "cancelled", 55000),
    ("Ready for Test", "started", 85000),
    ("In Testing", "started", 100000),
]


def build_project(workspace, user, identifier="REL", role=20):
    project = Project.objects.create(name=f"Project {identifier}", identifier=identifier, workspace=workspace)
    ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=role, is_active=True)
    State.objects.bulk_create(
        [
            State(
                name=name,
                group=group,
                sequence=sequence,
                color="#000000",
                project=project,
                workspace=workspace,
                default=name == "Backlog",
            )
            for name, group, sequence in CCI_STATES
        ]
    )
    states = {s.name: s for s in State.objects.filter(project=project)}
    return project, states


def make_issue(project, state, name="Item"):
    return Issue.objects.create(name=name, project=project, workspace=project.workspace, state=state)

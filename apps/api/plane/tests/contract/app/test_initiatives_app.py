# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from plane.app.views.initiative import InitiativeEndpoint
from plane.db.models import (
    Initiative,
    InitiativeModule,
    Issue,
    Module,
    ModuleIssue,
    Project,
    ProjectMember,
    State,
    User,
    Workspace,
    WorkspaceMember,
)

pytestmark = [pytest.mark.contract, pytest.mark.django_db]


def url(workspace, initiative=None, suffix=""):
    base = f"/api/workspaces/{workspace.slug}/initiatives/"
    return f"{base}{initiative.id}/{suffix}" if initiative else base


@pytest.fixture
def projects(workspace, create_user):
    result = []
    for identifier in ("INITONE", "INITTWO"):
        project = Project.objects.create(name=identifier, identifier=identifier, workspace=workspace)
        ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=15)
        result.append(project)
    return result


@pytest.fixture
def modules(projects, workspace):
    return [Module.objects.create(name="Giving", project=p, workspace=workspace) for p in projects]


@pytest.fixture
def initiative(workspace, create_user):
    row = Initiative(name="Giving", workspace=workspace)
    row.save(created_by_id=create_user.id)
    return row


def attach(initiative, module):
    return InitiativeModule.objects.create(initiative=initiative, module=module, workspace=initiative.workspace)


def item(module, user, group="started"):
    state, _ = State.objects.get_or_create(name=group, group=group, project=module.project, workspace=module.workspace)
    issue = Issue(name=f"Giving {group}", state=state, project=module.project, workspace=module.workspace)
    issue.save(created_by_id=user.id)
    ModuleIssue.objects.create(module=module, issue=issue, project=module.project, workspace=module.workspace)
    return issue


def test_create_list_retrieve_patch_delete(session_client, workspace, create_user):
    response = session_client.post(url(workspace), {"name": "Giving", "description": "One outcome"}, format="json")
    assert response.status_code == 201
    data = response.json()
    assert data["created_by"] == str(create_user.id)
    assert data["module_ids"] == data["project_ids"] == []
    assert data["total_issues"] == 0
    initiative = Initiative.objects.get(pk=data["id"])
    assert session_client.get(url(workspace)).json() == [data]
    assert session_client.get(url(workspace, initiative)).json() == data
    response = session_client.patch(
        url(workspace, initiative),
        {
            "name": "Unified giving",
            "description": "Across projects",
            "lead_id": str(create_user.id),
            "start_date": "2026-11-01",
            "target_date": "2026-12-01",
            "sort_order": 10,
        },
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["lead_id"] == str(create_user.id)
    assert response.json()["name"] == "Unified giving"
    assert session_client.delete(url(workspace, initiative)).status_code == 204
    assert session_client.get(url(workspace)).json() == []
    assert session_client.get(url(workspace, initiative)).status_code == 404


def test_cross_project_modules_idempotent_remove_and_readd(session_client, workspace, initiative, modules):
    payload = {"module_ids": [str(m.id) for m in modules] + [str(modules[0].id)]}
    for _ in range(2):
        response = session_client.post(url(workspace, initiative, "modules/"), payload, format="json")
        assert response.status_code == 200
        assert set(response.json()["module_ids"]) == {str(m.id) for m in modules}
        assert set(response.json()["project_ids"]) == {str(m.project_id) for m in modules}
    assert InitiativeModule.objects.filter(initiative=initiative).count() == 2
    assert session_client.delete(url(workspace, initiative, f"modules/{modules[0].id}/")).status_code == 204
    assert session_client.get(url(workspace, initiative)).json()["module_ids"] == [str(modules[1].id)]
    assert session_client.post(url(workspace, initiative, "modules/"), payload, format="json").status_code == 200
    second = Initiative.objects.create(name="Another outcome", workspace=workspace)
    assert session_client.post(url(workspace, second, "modules/"), payload, format="json").status_code == 200


def test_distinct_progress_and_issue_contract(session_client, workspace, initiative, modules, create_user):
    for module in modules:
        attach(initiative, module)
    groups = ["completed", "cancelled", "started", "unstarted", "backlog"]
    issues = [item(modules[i % 2], create_user, group) for i, group in enumerate(groups)]
    extra = Module.objects.create(name="Other module", workspace=workspace, project=modules[0].project)
    attach(initiative, extra)
    ModuleIssue.objects.create(module=extra, issue=issues[0], project=extra.project, workspace=workspace)
    data = session_client.get(url(workspace, initiative)).json()
    assert data["total_issues"] == 5
    for group in groups:
        assert data[f"{group}_issues"] == 1
    response = session_client.get(url(workspace, initiative, "issues/"))
    assert response.status_code == 200
    assert {row["id"] for row in response.json()} == {str(i.id) for i in issues}
    for issue in issues:
        expected = session_client.get(
            f"/api/workspaces/{workspace.slug}/projects/{issue.project_id}/issues/list/",
            {"issues": str(issue.id)},
        )
        assert expected.status_code == 200
        assert next(row for row in response.json() if row["id"] == str(issue.id)) == expected.json()[0]


@pytest.mark.parametrize("restriction", ["missing", "inactive", "deleted", "archived_project"])
@pytest.mark.parametrize("role", [15, 20])
def test_project_visibility(session_client, workspace, initiative, modules, create_user, restriction, role):
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=role)
    for module in modules:
        attach(initiative, module)
        item(module, create_user)
    member = ProjectMember.objects.filter(project=modules[1].project, member=create_user)
    if restriction == "missing":
        member.delete(soft=False)
    elif restriction == "inactive":
        member.update(is_active=False)
    elif restriction == "deleted":
        member.update(deleted_at=timezone.now())
    else:
        Project.objects.filter(pk=modules[1].project_id).update(archived_at=timezone.now())
    for data in [session_client.get(url(workspace)).json()[0], session_client.get(url(workspace, initiative)).json()]:
        assert data["module_ids"] == [str(modules[0].id)]
        assert data["project_ids"] == [str(modules[0].project_id)]
        assert data["total_issues"] == data["started_issues"] == 1
    issues = session_client.get(url(workspace, initiative, "issues/")).json()
    assert len(issues) == 1
    assert issues[0]["project_id"] == str(modules[0].project_id)
    assert (
        session_client.post(
            url(workspace, initiative, "modules/"),
            {
                "module_ids": [str(modules[1].id)],
            },
            format="json",
        ).status_code
        == 400
    )
    assert session_client.delete(url(workspace, initiative, f"modules/{modules[1].id}/")).status_code == 404


@pytest.mark.parametrize(
    "restriction", ["deleted", "archived", "draft", "deleted_link", "deleted_module", "removed_module"]
)
def test_hidden_items_do_not_count(session_client, workspace, initiative, modules, create_user, restriction):
    link = attach(initiative, modules[0])
    issue = item(modules[0], create_user)
    if restriction == "deleted":
        Issue.objects.filter(pk=issue.pk).update(deleted_at=timezone.now())
    elif restriction == "archived":
        Issue.objects.filter(pk=issue.pk).update(archived_at=timezone.now().date())
    elif restriction == "draft":
        Issue.objects.filter(pk=issue.pk).update(is_draft=True)
    elif restriction == "deleted_link":
        ModuleIssue.objects.filter(issue=issue).update(deleted_at=timezone.now())
    elif restriction == "deleted_module":
        Module.objects.filter(pk=modules[0].pk).update(deleted_at=timezone.now())
    else:
        InitiativeModule.objects.filter(pk=link.pk).update(deleted_at=timezone.now())
    assert session_client.get(url(workspace, initiative)).json()["total_issues"] == 0
    assert session_client.get(url(workspace, initiative, "issues/")).json() == []


def test_only_linked_modules_count(session_client, workspace, initiative, modules, create_user):
    attach(initiative, modules[0])
    item(modules[0], create_user)
    other = Initiative.objects.create(name="Other", workspace=workspace)
    attach(other, modules[1])
    item(modules[1], create_user)
    assert session_client.get(url(workspace, initiative)).json()["total_issues"] == 1
    assert len(session_client.get(url(workspace, initiative, "issues/")).json()) == 1


def test_guests_forbidden_on_every_endpoint(session_client, workspace, initiative, modules, create_user):
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=5)
    for method, path, data in [
        ("get", url(workspace), {}),
        ("post", url(workspace), {"name": "No"}),
        ("get", url(workspace, initiative), {}),
        ("patch", url(workspace, initiative), {"name": "No"}),
        ("delete", url(workspace, initiative), {}),
        ("get", url(workspace, initiative, "issues/"), {}),
        ("post", url(workspace, initiative, "modules/"), {"module_ids": [str(modules[0].id)]}),
        ("delete", url(workspace, initiative, f"modules/{modules[0].id}/"), {}),
    ]:
        assert getattr(session_client, method)(path, data, format="json").status_code == 403


def test_duplicate_name_and_reuse_after_delete(session_client, workspace, initiative):
    assert session_client.post(url(workspace), {"name": initiative.name}, format="json").status_code == 400
    other = Initiative.objects.create(name="Other", workspace=workspace)
    assert session_client.patch(url(workspace, other), {"name": initiative.name}, format="json").status_code == 400
    assert session_client.delete(url(workspace, initiative)).status_code == 204
    assert session_client.post(url(workspace), {"name": initiative.name}, format="json").status_code == 201


def test_delete_requires_creator_or_admin(session_client, workspace, initiative):
    member = User.objects.create(email="initiative-member@plane.so", username="initiative-member")
    membership = WorkspaceMember.objects.create(workspace=workspace, member=member, role=15)
    session_client.force_authenticate(user=member)
    assert (
        session_client.patch(url(workspace, initiative), {"description": "Allowed"}, format="json").status_code == 200
    )
    assert session_client.delete(url(workspace, initiative)).status_code == 403
    membership.role = 20
    membership.save()
    assert session_client.delete(url(workspace, initiative)).status_code == 204


@pytest.mark.parametrize("payload", [{}, {"module_ids": []}, {"module_ids": ["bad"]}, {"module_ids": [str(uuid4())]}])
def test_invalid_modules(session_client, workspace, initiative, payload):
    assert session_client.post(url(workspace, initiative, "modules/"), payload, format="json").status_code == 400


def test_foreign_workspace_module_rejected_atomically(session_client, workspace, initiative, modules, create_user):
    other = Workspace.objects.create(name="Other", slug="other-initiative", owner=create_user)
    project = Project.objects.create(name="Other", identifier="OTHER", workspace=other)
    ProjectMember.objects.create(project=project, workspace=other, member=create_user, role=20)
    module = Module.objects.create(name="Other", workspace=other, project=project)
    response = session_client.post(
        url(workspace, initiative, "modules/"),
        {
            "module_ids": [str(modules[0].id), str(module.id)],
        },
        format="json",
    )
    assert response.status_code == 400
    assert not InitiativeModule.objects.filter(initiative=initiative).exists()


def test_list_query_count_does_not_grow(django_assert_num_queries, workspace, create_user, initiative, modules):
    for i in range(3):
        row = Initiative.objects.create(name=f"Outcome {i}", workspace=workspace)
        for module in modules:
            attach(row, module)
    request = APIRequestFactory().get(url(workspace))
    force_authenticate(request, user=create_user)
    with django_assert_num_queries(2):
        response = InitiativeEndpoint.as_view()(request, slug=workspace.slug)
        response.render()
    assert response.status_code == 200
    assert len(response.data) == 4


def test_real_session_authentication(api_client, workspace, create_user, initiative):
    api_client.force_login(create_user)
    assert api_client.get(url(workspace, initiative)).status_code == 200


@pytest.mark.parametrize("view_all", [False, True])
def test_project_guest_rules_apply_to_items(session_client, workspace, initiative, modules, create_user, view_all):
    attach(initiative, modules[0])
    own = item(modules[0], create_user)
    other = User.objects.create(email="other-initiative-author@plane.so", username="other-initiative-author")
    foreign = item(modules[0], other)
    ProjectMember.objects.filter(project=modules[0].project, member=create_user).update(role=5)
    Project.objects.filter(pk=modules[0].project_id).update(guest_view_all_features=view_all)
    assert session_client.get(url(workspace, initiative)).json()["total_issues"] == (2 if view_all else 1)
    expected = {str(own.id), str(foreign.id)} if view_all else {str(own.id)}
    assert {row["id"] for row in session_client.get(url(workspace, initiative, "issues/")).json()} == expected


@pytest.mark.parametrize("membership", ["missing", "inactive"])
def test_inactive_or_missing_workspace_membership(session_client, workspace, initiative, create_user, membership):
    members = WorkspaceMember.objects.filter(workspace=workspace, member=create_user)
    if membership == "missing":
        members.delete(soft=False)
    else:
        members.update(is_active=False)
    assert session_client.get(url(workspace)).status_code == 403
    assert session_client.get(url(workspace, initiative)).status_code == 403


def test_archived_module_remains_linked(session_client, workspace, initiative, modules, create_user):
    attach(initiative, modules[0])
    item(modules[0], create_user)
    Module.objects.filter(pk=modules[0].pk).update(archived_at=timezone.now())
    data = session_client.get(url(workspace, initiative)).json()
    assert data["module_ids"] == [str(modules[0].id)]
    assert data["total_issues"] == 1

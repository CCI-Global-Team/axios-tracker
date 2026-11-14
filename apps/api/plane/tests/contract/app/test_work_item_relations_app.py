# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the workspace's bulk, stored work-item relations."""

from datetime import timedelta
from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from plane.app.views.issue.relation import WorkItemRelationsEndpoint
from plane.db.models import Issue, IssueRelation, Project, ProjectMember, User, Workspace, WorkspaceMember


pytestmark = [pytest.mark.contract, pytest.mark.django_db]
URL = "/api/workspaces/{slug}/work-item-relations/"


def make_issue(project, author):
    issue = Issue(name="Plan item", project=project, workspace=project.workspace)
    issue.save(created_by_id=author.id)
    return issue


def make_relation(issue, related_issue, relation_type="blocked_by"):
    return IssueRelation.objects.create(
        issue=issue,
        related_issue=related_issue,
        project=issue.project,
        workspace=issue.workspace,
        relation_type=relation_type,
    )


def relation_data(relation):
    return {
        "id": str(relation.id),
        "relation_type": relation.relation_type,
        "issue_id": str(relation.issue_id),
        "related_issue_id": str(relation.related_issue_id),
        "project_id": str(relation.project_id),
        "related_project_id": str(relation.related_issue.project_id),
    }


@pytest.fixture
def projects(workspace, create_user):
    projects = []
    for identifier in ("PLANONE", "PLANTWO"):
        project = Project.objects.create(name=identifier, identifier=identifier, workspace=workspace)
        ProjectMember.objects.create(project=project, workspace=workspace, member=create_user, role=15)
        projects.append(project)
    return projects


@pytest.fixture
def relations(projects, create_user):
    first = make_issue(projects[0], create_user)
    second = make_issue(projects[1], create_user)
    third = make_issue(projects[0], create_user)
    blocked_by = make_relation(first, second)
    relates_to = make_relation(second, third, "relates_to")
    # Ensure ordering is by created_at, irrespective of UUID and insertion order.
    IssueRelation.objects.filter(pk=relates_to.pk).update(created_at=timezone.now() - timedelta(days=1))
    return [relates_to, blocked_by]


def test_member_sees_stored_cross_project_relations(session_client, workspace, relations):
    response = session_client.get(URL.format(slug=workspace.slug))

    assert response.status_code == 200
    assert response.json()["relations"] == [relation_data(relation) for relation in relations]


@pytest.mark.parametrize("relation_type", ["duplicate", "start_before", "finish_before", "implemented_by"])
def test_relation_types_are_not_expanded(session_client, workspace, relations, relation_type):
    relation = relations[0]
    IssueRelation.objects.filter(pk=relation.pk).update(relation_type=relation_type)
    relation.relation_type = relation_type

    response = session_client.get(URL.format(slug=workspace.slug))

    assert response.status_code == 200
    assert response.json()["relations"] == [relation_data(row) for row in relations]


@pytest.mark.parametrize("side", ["issue", "related_issue"])
@pytest.mark.parametrize("restriction", ["non_member", "inactive", "deleted_member", "archived_project"])
def test_both_projects_must_be_visible(session_client, workspace, create_user, relations, side, restriction):
    project = getattr(relations[0], side).project
    membership = ProjectMember.objects.filter(project=project, member=create_user)
    if restriction == "non_member":
        membership.delete(soft=False)
    elif restriction == "inactive":
        membership.update(is_active=False)
    elif restriction == "deleted_member":
        membership.update(deleted_at=timezone.now())
    else:
        Project.objects.filter(pk=project.pk).update(archived_at=timezone.now())

    response = session_client.get(URL.format(slug=workspace.slug))

    assert response.status_code == 200
    assert response.json()["relations"] == []


@pytest.mark.parametrize("side", ["issue", "related_issue"])
def test_soft_deleted_issues_are_excluded(session_client, workspace, relations, side):
    deleted_issue = getattr(relations[0], side)
    Issue.objects.filter(pk=deleted_issue.pk).update(deleted_at=timezone.now())
    expected = [row for row in relations if deleted_issue.id not in (row.issue_id, row.related_issue_id)]

    response = session_client.get(URL.format(slug=workspace.slug))

    assert response.status_code == 200
    assert response.json()["relations"] == [relation_data(row) for row in expected]


def test_soft_deleted_relations_are_excluded(session_client, workspace, relations):
    IssueRelation.objects.filter(pk=relations[0].pk).update(deleted_at=timezone.now())

    response = session_client.get(URL.format(slug=workspace.slug))

    assert response.status_code == 200
    assert response.json()["relations"] == [relation_data(relations[1])]


def test_archived_issues_remain_visible(session_client, workspace, relations):
    Issue.objects.filter(workspace=workspace).update(archived_at=timezone.now().date())

    response = session_client.get(URL.format(slug=workspace.slug))

    assert response.status_code == 200
    assert response.json()["relations"] == [relation_data(row) for row in relations]


@pytest.mark.parametrize("side", ["issue", "related_issue"])
def test_project_filter_touches_either_endpoint(session_client, workspace, projects, relations, create_user, side):
    local_issue = make_issue(projects[0], create_user)
    make_relation(relations[1].issue, local_issue, "relates_to")
    project_id = getattr(relations[0], side).project_id

    response = session_client.get(URL.format(slug=workspace.slug), {"project_id": f"{uuid4()},{project_id}"})

    assert response.status_code == 200
    expected = IssueRelation.objects.filter(workspace=workspace).order_by("created_at")
    assert response.json()["relations"] == [
        relation_data(row) for row in expected if project_id in (row.issue.project_id, row.related_issue.project_id)
    ]


@pytest.mark.parametrize("side", ["issue", "related_issue"])
def test_issue_filter_touches_either_endpoint(session_client, workspace, relations, side):
    issue_id = getattr(relations[0], f"{side}_id")

    response = session_client.get(URL.format(slug=workspace.slug), {"issue_ids": f"{uuid4()},{issue_id}"})

    assert response.status_code == 200
    assert response.json()["relations"] == [
        relation_data(row) for row in relations if issue_id in (row.issue_id, row.related_issue_id)
    ]


def test_project_and_issue_filters_intersect(session_client, workspace, relations):
    response = session_client.get(
        URL.format(slug=workspace.slug),
        {"project_id": str(uuid4()), "issue_ids": str(relations[0].issue_id)},
    )

    assert response.status_code == 200
    assert response.json()["relations"] == []


@pytest.mark.parametrize("count, expected_status", [(1000, 200), (1001, 400)])
def test_issue_ids_limit(session_client, workspace, relations, count, expected_status):
    ids = [str(relations[0].issue_id)] + [str(uuid4()) for _ in range(count - 1)]

    response = session_client.get(URL.format(slug=workspace.slug), {"issue_ids": ",".join(ids)})

    assert response.status_code == expected_status
    if expected_status == 200:
        assert response.json()["relations"] == [relation_data(row) for row in relations]


@pytest.mark.parametrize("parameter", ["project_id", "issue_ids"])
def test_invalid_uuid_returns_400(session_client, workspace, parameter):
    response = session_client.get(URL.format(slug=workspace.slug), {parameter: "not-a-uuid"})

    assert response.status_code == 400
    assert parameter in response.json()


@pytest.mark.parametrize("view_all", [False, True])
def test_guest_visibility_applies_to_both_ends(session_client, workspace, projects, create_user, view_all):
    guest = User.objects.create(email="plan-guest@plane.so", username="plan-guest")
    WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
    for project in projects:
        ProjectMember.objects.create(project=project, workspace=workspace, member=guest, role=5)
        Project.objects.filter(pk=project.pk).update(guest_view_all_features=view_all)
    own_first = make_issue(projects[0], guest)
    own_second = make_issue(projects[1], guest)
    foreign_first = make_issue(projects[0], create_user)
    foreign_second = make_issue(projects[1], create_user)
    allowed = make_relation(own_first, own_second)
    hidden = [
        make_relation(own_first, foreign_second, "relates_to"),
        make_relation(foreign_first, own_second, "relates_to"),
        make_relation(foreign_first, foreign_second),
    ]
    session_client.force_authenticate(user=guest)

    response = session_client.get(URL.format(slug=workspace.slug))

    assert response.status_code == 200
    expected = [allowed, *hidden] if view_all else [allowed]
    assert response.json()["relations"] == [relation_data(row) for row in expected]


def test_other_workspace_relations_are_excluded(session_client, workspace, create_user, projects, relations):
    other_workspace = Workspace.objects.create(name="Other", slug="other", owner=create_user)
    WorkspaceMember.objects.create(workspace=other_workspace, member=create_user, role=20)
    project = Project.objects.create(name="Other", identifier="OTHER", workspace=other_workspace)
    ProjectMember.objects.create(project=project, workspace=other_workspace, member=create_user, role=20)
    other_issue = make_issue(project, create_user)
    make_relation(other_issue, make_issue(project, create_user))
    # Even malformed cross-workspace rows must not disclose the other endpoint.
    make_relation(relations[0].issue, other_issue)
    make_relation(other_issue, relations[0].related_issue)

    response = session_client.get(URL.format(slug=workspace.slug))

    assert response.status_code == 200
    assert response.json()["relations"] == [relation_data(row) for row in relations]


@pytest.mark.parametrize("membership", ["missing", "inactive"])
def test_non_workspace_member_is_refused(session_client, workspace, create_user, relations, membership):
    members = WorkspaceMember.objects.filter(workspace=workspace, member=create_user)
    if membership == "missing":
        members.delete(soft=False)
    else:
        members.update(is_active=False)

    response = session_client.get(URL.format(slug=workspace.slug))

    assert response.status_code in (403, 404)


def test_unauthenticated_request_is_refused(api_client, workspace):
    response = api_client.get(URL.format(slug=workspace.slug))

    assert response.status_code in (401, 403)


def test_session_authentication(api_client, workspace, create_user, relations):
    api_client.force_login(create_user)

    response = api_client.get(URL.format(slug=workspace.slug))

    assert response.status_code == 200
    assert response.json()["relations"] == [relation_data(row) for row in relations]


def test_single_relation_query(django_assert_num_queries, workspace, create_user, relations):
    request = APIRequestFactory().get(URL.format(slug=workspace.slug))
    force_authenticate(request, user=create_user)

    # One workspace permission query, one relations query (both issue-visibility checks are subqueries)
    # and one query for both ends' details; the count does not grow with the number of relations.
    with django_assert_num_queries(3):
        response = WorkItemRelationsEndpoint.as_view()(request, slug=workspace.slug)
        response.render()

    assert response.status_code == 200
    assert len(response.data["relations"]) == len(relations)
    ends = {str(r.issue_id) for r in relations} | {str(r.related_issue_id) for r in relations}
    assert set(response.data["work_items"]) == ends
    item = next(iter(response.data["work_items"].values()))
    assert set(item) == {
        "name",
        "sequence_id",
        "project_id",
        "project_identifier",
        "state_group",
        "state_name",
        "is_archived",
    }

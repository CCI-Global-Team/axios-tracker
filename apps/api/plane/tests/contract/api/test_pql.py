# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: GAM-737 - limited PQL on work item lists, and the workspace-wide work item list."""

from datetime import date, timedelta
from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.api.pql import Parser, PQLError
from plane.db.models import (
    Cycle,
    CycleIssue,
    IssueAssignee,
    IssueLabel,
    IssueMention,
    IssueSubscriber,
    Label,
    Module,
    ModuleIssue,
    ProjectMember,
    User,
    WorkspaceMember,
)
from plane.tests.contract.release_helpers import build_project, make_issue

ME = uuid4()


def parse(text, project_ids=()):
    return Parser(text, ME, list(project_ids)).parse()


@pytest.mark.unit
class TestParser:
    def test_my_open_work(self):
        assert parse("assignee = currentUser() AND stateGroup IN openStates()") == {
            "and": [{"assignee_id": str(ME)}, {"state_group__in": "backlog,unstarted,started"}]
        }

    def test_operators(self):
        state = uuid4()
        assert parse('priority != "HIGH"') == {"not": {"priority": "high"}}
        assert parse(f'state NOT IN ("{state}")') == {"not": {"state_id": str(state)}}
        assert parse('NOT (priority = "low" OR priority = "none")') == {
            "not": {"or": [{"priority": "low"}, {"priority": "none"}]}
        }
        assert parse("label IS EMPTY") == {"label_id__isnull": True}
        assert parse("cycle is not null") == {"cycle_id__isnull": False}

    def test_dates_become_ranges(self):
        assert parse('dueDate >= "2026-11-01"') == {"target_date__range": "2026-11-01,9999-12-31"}
        assert parse('dueDate > "2026-11-01"') == {"target_date__range": "2026-11-02,9999-12-31"}
        assert parse('createdAt < "2026-11-01"') == {"created_at__range": "0001-01-01,2026-10-31"}
        assert parse('updatedAt <= "2026-11-01"') == {"updated_at__range": "0001-01-01,2026-11-01"}
        assert parse('startDate BETWEEN "2026-11-01" AND "2026-11-07"') == {
            "start_date__range": "2026-11-01,2026-11-07"
        }
        assert parse('startDate BETWEEN ("2026-11-01", "2026-11-07")') == {"start_date__range": "2026-11-01,2026-11-07"}
        assert parse('dueDate = "2026-11-01"') == {"target_date": "2026-11-01"}

    def test_open_ended_dates_at_the_edges(self):
        assert parse('dueDate >= "0001-01-01"') == {"target_date__range": "0001-01-01,9999-12-31"}
        assert parse('dueDate <= "9999-12-31"') == {"target_date__range": "0001-01-01,9999-12-31"}
        for pql in ('dueDate < "0001-01-01"', 'dueDate > "9999-12-31"'):
            with pytest.raises(PQLError) as exc:
                parse(pql)
            assert "out of range" in exc.value.detail["pql"]

    @pytest.mark.parametrize("opening", ["(", "NOT "])
    def test_deep_nesting_is_a_pql_error_not_a_crash(self, opening):
        closing = ")" if opening == "(" else ""
        with pytest.raises(PQLError) as exc:
            parse(opening * 400 + 'priority = "high"' + closing * 400)
        assert "more than 10 deep" in exc.value.detail["pql"]
        assert parse(opening * 10 + 'priority = "high"' + closing * 10)

    @pytest.mark.parametrize("pql", [f'assignee = currentUser("{uuid4()}")', "assignee = currentUser(isOverdue())"])
    def test_function_arguments_are_refused(self, pql):
        with pytest.raises(PQLError) as exc:
            parse(pql)
        assert "takes no arguments" in exc.value.detail["pql"]

    @pytest.mark.parametrize(
        "pql,named",
        [
            ("isOverdue()", "isOverdue()"),
            ("dueDate > daysAgo(7)", "daysAgo()"),
            ('title ~ "x"', "'title'"),
            ('priority ~ "high"', "~ (contains)"),
            ("dueDate < today()", "today()"),
            ("assignee = activeCycle()", "activeCycle() on assignee"),
            ("dueDate IS NULL", "IS NULL / IS EMPTY on dueDate"),
        ],
    )
    def test_unsupported_names_the_part_and_says_retrying_wont_help(self, pql, named):
        with pytest.raises(PQLError) as exc:
            parse(pql)
        message = exc.value.detail["pql"]
        assert named in message
        assert "retrying with it won't help" in message

    @pytest.mark.parametrize(
        "pql,says",
        [
            ('state = "Todo"', "takes a UUID"),
            ('priority = "critical"', "must be one of"),
            ('dueDate > "Nov 1"', "YYYY-MM-DD"),
            ('dueDate BETWEEN "2026-11-07" AND "2026-11-01"', "is empty"),
            ("priority =", "ended too early"),
            ('priority = "high" priority', "Unexpected"),
        ],
    )
    def test_fixable_errors(self, pql, says):
        with pytest.raises(PQLError) as exc:
            parse(pql)
        assert says in exc.value.detail["pql"]


@pytest.fixture
def board(db, workspace, create_user):
    other = User.objects.create(email="other@example.com", username="other")
    WorkspaceMember.objects.create(workspace=workspace, member=other, role=15)
    alpha, states = build_project(workspace, create_user, identifier="ALP")
    beta, beta_states = build_project(workspace, create_user, identifier="BET")
    hidden, hidden_states = build_project(workspace, other, identifier="HID")
    left, left_states = build_project(workspace, create_user, identifier="LFT")
    ProjectMember.objects.filter(project=left, member=create_user).update(is_active=False)

    def assign(issue, *users):
        for user in users:
            IssueAssignee.objects.create(issue=issue, assignee=user, project=issue.project, workspace=workspace)

    mine = make_issue(alpha, states["Backlog"], "mine")
    shared = make_issue(alpha, states["In Progress"], "shared")
    theirs = make_issue(alpha, states["Done"], "theirs")
    reassigned = make_issue(alpha, states["Backlog"], "reassigned")
    mine_in_beta = make_issue(beta, beta_states["Backlog"], "mine in beta")
    mine_hidden = make_issue(hidden, hidden_states["Backlog"], "mine in a project I'm not in")
    mine_left = make_issue(left, left_states["Backlog"], "mine in a project I left")
    assign(mine, create_user)
    assign(shared, create_user, other)
    assign(theirs, other)
    assign(reassigned, create_user, other)
    IssueAssignee.objects.get(issue=reassigned, assignee=create_user).delete()
    for issue in (mine_in_beta, mine_hidden, mine_left):
        assign(issue, create_user)
    return {
        "other": other,
        "alpha": alpha,
        "beta": beta,
        "states": states,
        "mine": mine,
        "shared": shared,
        "theirs": theirs,
        "reassigned": reassigned,
        "mine_in_beta": mine_in_beta,
    }


def project_url(workspace, project):
    return f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/work-items/"


def workspace_url(workspace):
    return f"/api/v1/workspaces/{workspace.slug}/work-items/"


def names(response):
    assert response.status_code == status.HTTP_200_OK, response.data
    return {item["name"] for item in response.data["results"]}


@pytest.mark.contract
class TestProjectList:
    @pytest.mark.django_db
    def test_assigned_to_me_returns_only_my_items_and_counts_them(self, api_key_client, workspace, board):
        response = api_key_client.get(project_url(workspace, board["alpha"]), {"pql": "assignee = currentUser()"})
        assert names(response) == {"mine", "shared"}
        assert response.data["total_count"] == 2

    @pytest.mark.django_db
    def test_unassigned_person_no_longer_matches_and_not_equal_is_a_set_difference(
        self, api_key_client, workspace, board
    ):
        url = project_url(workspace, board["alpha"])
        assert "reassigned" not in names(api_key_client.get(url, {"pql": "assignee = currentUser()"}))
        assert names(api_key_client.get(url, {"pql": "assignee != currentUser()"})) == {"theirs", "reassigned"}

    @pytest.mark.django_db
    def test_and_on_the_same_relation_means_both(self, api_key_client, workspace, board):
        pql = f'assignee = currentUser() AND assignee = "{board["other"].id}"'
        assert names(api_key_client.get(project_url(workspace, board["alpha"]), {"pql": pql})) == {"shared"}

    @pytest.mark.django_db
    def test_state_group_functions_and_or(self, api_key_client, workspace, board):
        url = project_url(workspace, board["alpha"])
        assert names(api_key_client.get(url, {"pql": "stateGroup IN closedStates()"})) == {"theirs"}
        pql = f'state = "{board["states"]["In Progress"].id}" OR stateGroup IN closedStates()'
        assert names(api_key_client.get(url, {"pql": pql})) == {"shared", "theirs"}

    @pytest.mark.django_db
    def test_pagination_keeps_the_filtered_total(self, api_key_client, workspace, board):
        response = api_key_client.get(
            project_url(workspace, board["alpha"]), {"pql": "assignee = currentUser()", "per_page": 1}
        )
        assert len(response.data["results"]) == 1
        assert response.data["total_count"] == 2
        assert response.data["next_page_results"] is True

    @pytest.mark.django_db
    def test_unsupported_pql_is_a_clear_400(self, api_key_client, workspace, board):
        response = api_key_client.get(project_url(workspace, board["alpha"]), {"pql": "isOverdue()"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "isOverdue()" in response.data["pql"]
        assert "won't help" in response.data["pql"]

    @pytest.mark.django_db
    def test_filters_parameter_is_still_rejected(self, api_key_client, workspace, board):
        response = api_key_client.get(project_url(workspace, board["alpha"]), {"filters": '{"priority": "high"}'})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_external_id_lookup_refuses_pql_and_the_workspace_route(self, api_key_client, workspace, board):
        lookup = {"external_id": "48-95489", "external_source": "gravity-forms"}
        with_pql = api_key_client.get(project_url(workspace, board["alpha"]), {**lookup, "pql": 'priority = "high"'})
        assert with_pql.status_code == status.HTTP_400_BAD_REQUEST
        assert "can't be combined with pql" in with_pql.data["error"]
        assert api_key_client.get(workspace_url(workspace), lookup).status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
class TestEachField:
    @pytest.mark.django_db
    def test_each_supported_field_matches_only_the_target(self, api_key_client, workspace, create_user, board):
        project, states = board["alpha"], board["states"]
        other = board["other"]
        common = {"project": project, "workspace": workspace}
        target = make_issue(project, states["Ready for Test"], "target")
        decoy = make_issue(project, states["Backlog"], "decoy")
        label = Label.objects.create(name="qa", color="#000000", **common)
        cycle = Cycle.objects.create(name="Sprint", owned_by=create_user, **common)
        module = Module.objects.create(name="Module", **common)
        IssueLabel.objects.create(issue=target, label=label, **common)
        CycleIssue.objects.create(issue=target, cycle=cycle, **common)
        ModuleIssue.objects.create(issue=target, module=module, **common)
        IssueMention.objects.create(issue=target, mention=other, **common)
        IssueSubscriber.objects.create(issue=target, subscriber=other, **common)
        type(target).objects.filter(pk=target.pk).update(
            priority="urgent",
            created_by=other,
            start_date=date(2026, 11, 2),
            target_date=date(2026, 11, 6),
            created_at=timezone.now() - timedelta(days=30),
        )
        type(decoy).objects.filter(pk=decoy.pk).update(priority="low")

        cases = [
            f'state = "{states["Ready for Test"].id}"',
            'stateGroup = "started" AND priority = "urgent"',
            'priority IN ("urgent")',
            f'label = "{label.id}"',
            f'cycle = "{cycle.id}"',
            f'module IN ("{module.id}")',
            f'project = "{project.id}" AND createdBy = "{other.id}"',
            f'mention = "{other.id}"',
            f'subscriber = "{other.id}"',
            'startDate = "2026-11-02"',
            'dueDate BETWEEN "2026-11-06" AND "2026-11-06"',
            'dueDate > "2026-11-05"',
            f'createdAt <= "{(date.today() - timedelta(days=29)).isoformat()}"',
            'updatedAt >= "2000-01-01" AND label IS NOT EMPTY',
        ]
        url = project_url(workspace, project)
        for pql in cases:
            assert names(api_key_client.get(url, {"pql": pql})) == {"target"}, pql


@pytest.mark.contract
class TestWorkspaceList:
    @pytest.mark.django_db
    def test_assigned_to_me_spans_my_projects_only(self, api_key_client, workspace, board):
        response = api_key_client.get(workspace_url(workspace), {"pql": "assignee = currentUser()"})
        assert names(response) == {"mine", "shared", "mine in beta"}
        assert response.data["total_count"] == 3

    @pytest.mark.django_db
    def test_without_pql_lists_every_project_i_am_an_active_member_of(self, api_key_client, workspace, board):
        assert names(api_key_client.get(workspace_url(workspace))) == {
            "mine",
            "shared",
            "theirs",
            "reassigned",
            "mine in beta",
        }

    @pytest.mark.django_db
    def test_non_member_of_the_workspace_is_refused(self, workspace, board):
        outsider = User.objects.create(email="outsider@example.com", username="outsider")
        client = APIClient()
        client.force_authenticate(user=outsider)
        assert client.get(workspace_url(workspace)).status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_missing_or_bad_key_is_refused(self, workspace, board):
        client = APIClient()
        assert client.get(workspace_url(workspace)).status_code in (401, 403)
        client.credentials(HTTP_X_API_KEY="not-a-key")
        assert client.get(workspace_url(workspace)).status_code in (401, 403)


@pytest.mark.contract
class TestCyclesAndModules:
    @pytest.fixture
    def sprint(self, workspace, create_user, board):
        common = {"project": board["alpha"], "workspace": workspace}
        now = timezone.now()
        cycle = Cycle.objects.create(
            name="Now",
            owned_by=create_user,
            start_date=now - timedelta(days=2),
            end_date=now + timedelta(days=5),
            **common,
        )
        module = Module.objects.create(name="Module", **common)
        for issue in (board["mine"], board["theirs"]):
            CycleIssue.objects.create(issue=issue, cycle=cycle, **common)
            ModuleIssue.objects.create(issue=issue, module=module, **common)
        return cycle, module

    @pytest.mark.django_db
    def test_active_cycle(self, api_key_client, workspace, board, sprint):
        response = api_key_client.get(
            project_url(workspace, board["alpha"]), {"pql": "cycle IN activeCycle() AND assignee = currentUser()"}
        )
        assert names(response) == {"mine"}

    @pytest.mark.django_db
    def test_no_active_cycle_is_an_error_not_an_empty_sprint(self, api_key_client, workspace, board):
        response = api_key_client.get(project_url(workspace, board["alpha"]), {"pql": "cycle = activeCycle()"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "no active cycle in ALP" in response.data["pql"]

    @pytest.mark.django_db
    def test_pql_applies_to_cycle_and_module_item_lists(self, api_key_client, workspace, board, sprint):
        cycle, module = sprint
        base = f"/api/v1/workspaces/{workspace.slug}/projects/{board['alpha'].id}"
        params = {"pql": "assignee = currentUser()"}
        cycle_items = api_key_client.get(f"{base}/cycles/{cycle.id}/cycle-issues/", params)
        assert names(cycle_items) == {"mine"}
        assert cycle_items.data["total_count"] == 1
        assert names(api_key_client.get(f"{base}/modules/{module.id}/module-issues/", params)) == {"mine"}

    @pytest.mark.django_db
    def test_bad_pql_on_a_cycle_list_is_rejected_not_ignored(self, api_key_client, workspace, board, sprint):
        cycle, _ = sprint
        url = f"/api/v1/workspaces/{workspace.slug}/projects/{board['alpha'].id}/cycles/{cycle.id}/cycle-issues/"
        assert api_key_client.get(url, {"pql": "isOverdue()"}).status_code == status.HTTP_400_BAD_REQUEST

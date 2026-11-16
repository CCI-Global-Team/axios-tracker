# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
from unittest.mock import patch
from uuid import uuid4

import pytest
from django.utils import timezone

from plane.authentication.utils.workspace_project_join import process_workspace_project_invitations
from plane.db.models import (
    Issue,
    IssueAssignee,
    Label,
    PendingInviteGrant,
    Project,
    ProjectMember,
    User,
    WorkspaceMember,
    WorkspaceMemberInvite,
)
from plane.utils.intake_campus import intake_assignee_id
from plane.utils.pending_invite_grants import apply_pending_grants

pytestmark = pytest.mark.contract
KINDS = list(PendingInviteGrant.Kind.values)
SINGLE_KINDS = ["label_owner", "project_default_assignee", "project_lead"]


@pytest.fixture(autouse=True)
def tasks():
    # CCI: acceptance must exercise the real views/helper without sending email or broker work.
    with (
        patch("celery.app.task.Task.delay"),
        patch("plane.app.views.workspace.invite.workspace_invitation.delay") as invitation,
        patch("plane.utils.pending_invite_grants.pending_invite_grants_notification.delay") as notification,
        patch("plane.utils.pending_invite_grants.issue_activity.delay") as activity,
    ):
        yield {"invitation": invitation, "notification": notification, "activity": activity}


@pytest.fixture
def project(workspace, create_user):
    result = Project.objects.create(name="Gamma", identifier="GAM", workspace=workspace)
    ProjectMember.objects.create(project=result, member=create_user, role=20)
    return result


@pytest.fixture
def invitee(db):
    return User.objects.create(email="invitee@example.test", username="invitee")


@pytest.fixture
def invite(workspace, create_user, invitee):
    invitation = WorkspaceMemberInvite(
        workspace=workspace, email=invitee.email, role=15, token="accept-token", created_by=create_user
    )
    invitation.save(disable_auto_set_user=True)
    return invitation


@pytest.fixture
def label(project, workspace):
    return Label.objects.create(project=project, workspace=workspace, name="Ikeja")


@pytest.fixture
def issue(project, workspace):
    return Issue.objects.create(project=project, workspace=workspace, name="Help with check-in")


def url(workspace):
    return f"/api/workspaces/{workspace.slug}/pending-grants/"


def body(project, kind="project_member", target=None, email="invitee@example.test"):
    data = {"email": email, "kind": kind, "project_id": str(project.pk)}
    if target:
        data["target_id"] = str(target.pk)
    return data


def make_grant(invite, project, kind="project_member", target=None):
    grant = PendingInviteGrant(
        workspace_id=invite.workspace_id,
        invite=invite,
        email=invite.email,
        project=project,
        kind=kind,
        target_id=target.pk if target else None,
        created_by_id=invite.created_by_id,
    )
    grant.save(disable_auto_set_user=True)
    return grant


def accept(path, session_client, invitee, workspace, invite):
    session_client.force_authenticate(user=invitee)
    if path == "signup":
        WorkspaceMemberInvite.objects.filter(pk=invite.pk).update(accepted=True)
        process_workspace_project_invitations(invitee)
    elif path == "join":
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/invitations/{invite.pk}/join/",
            {"token": invite.token, "accepted": True},
            format="json",
        )
        assert response.status_code == 200, response.data
    else:
        response = session_client.post(
            "/api/users/me/workspaces/invitations/", {"invitations": [str(invite.pk)]}, format="json"
        )
        assert response.status_code == 204, response.data


def test_create_new_invite(session_client, workspace, project, tasks, django_capture_on_commit_callbacks, create_user):
    with django_capture_on_commit_callbacks(execute=True):
        response = session_client.post(url(workspace), body(project, email="NewPerson@Example.test"), format="json")
    assert response.status_code == 201, response.data
    assert set(response.data) == {
        "id",
        "email",
        "kind",
        "project_id",
        "target_id",
        "invite_id",
        "created_by",
        "created_at",
    }
    grant = PendingInviteGrant.objects.get(pk=response.data["id"])
    assert grant.email == "newperson@example.test"
    assert grant.invite.email == grant.email
    assert grant.invite.role == 15
    assert grant.invite.token
    assert grant.created_by_id == create_user.pk
    assert grant.invite.created_by_id == create_user.pk
    tasks["invitation"].assert_called_once()


def test_reuse_invite_and_dedupe(session_client, workspace, project, invite, tasks):
    first = session_client.post(url(workspace), body(project), format="json")
    second = session_client.post(url(workspace), body(project), format="json")
    assert (first.status_code, second.status_code) == (201, 200)
    assert first.data["id"] == second.data["id"]
    assert str(first.data["invite_id"]) == str(invite.pk)
    assert WorkspaceMemberInvite.objects.filter(workspace=workspace).count() == 1
    tasks["invitation"].assert_not_called()


def test_existing_workspace_member_rejected(session_client, workspace, project, create_user):
    response = session_client.post(url(workspace), body(project, email=create_user.email.upper()), format="json")
    assert response.status_code == 400
    assert not PendingInviteGrant.objects.exists()


@pytest.mark.parametrize("role", [5, 15])
def test_non_admin_cannot_create(session_client, workspace, project, create_user, role):
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=role)
    response = session_client.post(url(workspace), body(project), format="json")
    assert response.status_code == 403


@pytest.mark.parametrize("kind", SINGLE_KINDS)
def test_replace_single_grant(session_client, workspace, project, label, invite, kind):
    target = label if kind == "label_owner" else None
    old = make_grant(invite, project, kind, target)
    response = session_client.post(
        url(workspace), body(project, kind, target, email="replacement@example.test"), format="json"
    )
    assert response.status_code == 201, response.data
    assert not PendingInviteGrant.objects.filter(pk=old.pk).exists()
    assert PendingInviteGrant.objects.filter(project=project, kind=kind).count() == 1
    assert PendingInviteGrant.objects.get(pk=response.data["id"]).email == "replacement@example.test"


def test_list_only_live_project_grants(session_client, workspace, project, invite, create_user):
    wanted = make_grant(invite, project)
    other = Project.objects.create(name="Other", identifier="OTH", workspace=workspace)
    make_grant(invite, other)
    deleted = make_grant(invite, project, "project_lead")
    PendingInviteGrant.objects.filter(pk=deleted.pk).delete()
    accepted = WorkspaceMemberInvite.objects.create(
        workspace=workspace, email="accepted@example.test", token="accepted", accepted=True
    )
    make_grant(accepted, project)
    revoked = WorkspaceMemberInvite.objects.create(workspace=workspace, email="revoked@example.test", token="revoked")
    make_grant(revoked, project)
    WorkspaceMemberInvite.objects.filter(pk=revoked.pk).delete()
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=15)
    response = session_client.get(url(workspace), {"project_id": str(project.pk)})
    assert response.status_code == 200
    assert [str(row["id"]) for row in response.data] == [str(wanted.pk)]


@pytest.mark.parametrize("admin", ["workspace", "project", "neither"])
def test_delete_grant_leaves_invite(session_client, workspace, project, invite, create_user, admin):
    grant = make_grant(invite, project)
    if admin != "workspace":
        WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=15)
    if admin == "neither":
        ProjectMember.objects.filter(project=project, member=create_user).update(role=15)
    response = session_client.delete(f"{url(workspace)}{grant.pk}/")
    assert response.status_code == (403 if admin == "neither" else 204)
    assert PendingInviteGrant.objects.filter(pk=grant.pk).exists() == (admin == "neither")
    assert WorkspaceMemberInvite.objects.filter(pk=invite.pk).exists()


def test_revoke_removes_grants(session_client, workspace, project, invite):
    grant = make_grant(invite, project)
    response = session_client.delete(f"/api/workspaces/{workspace.slug}/invitations/{invite.pk}/")
    assert response.status_code == 204
    assert not PendingInviteGrant.objects.filter(pk=grant.pk).exists()
    assert not WorkspaceMemberInvite.objects.filter(pk=invite.pk).exists()


@pytest.mark.parametrize("change", ["other_field", "unchanged_null", "someone_else"])
def test_label_patch_cancels_only_a_new_owner(session_client, workspace, project, label, invite, create_user, change):
    grant = make_grant(invite, project, "label_owner", label)
    payload = {
        "other_field": {"color": "#abcdef"},
        "unchanged_null": {"default_assignee": None},
        "someone_else": {"default_assignee": str(create_user.pk)},
    }[change]
    response = session_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.pk}/issue-labels/{label.pk}/", payload, format="json"
    )
    assert response.status_code == 200, response.data
    assert PendingInviteGrant.objects.filter(pk=grant.pk).exists() == (change != "someone_else")


@pytest.mark.parametrize(
    "kind,field", [("project_default_assignee", "default_assignee"), ("project_lead", "project_lead")]
)
@pytest.mark.parametrize("change", ["both_fields_unchanged", "someone_else"])
def test_project_patch_cancels_only_a_changed_field(
    session_client, workspace, project, invite, create_user, kind, field, change
):
    # CCI: the settings form sends lead and default assignee together on every save.
    grant = make_grant(invite, project, kind)
    payload = {"default_assignee": None, "project_lead": None}
    if change == "someone_else":
        payload[field] = str(create_user.pk)
    response = session_client.patch(f"/api/workspaces/{workspace.slug}/projects/{project.pk}/", payload, format="json")
    assert response.status_code == 200, response.data
    assert PendingInviteGrant.objects.filter(pk=grant.pk).exists() == (change != "someone_else")


@pytest.mark.parametrize("path", ["join", "bulk", "signup"])
@pytest.mark.parametrize("kind", KINDS)
def test_every_kind_through_each_acceptance_path(
    session_client,
    workspace,
    project,
    invite,
    invitee,
    label,
    issue,
    kind,
    path,
    tasks,
    django_capture_on_commit_callbacks,
    create_user,
):
    target = label if kind == "label_owner" else issue if kind == "issue_assignee" else None
    grant = make_grant(invite, project, kind, target)
    with django_capture_on_commit_callbacks(execute=True):
        accept(path, session_client, invitee, workspace, invite)
    assert WorkspaceMember.objects.filter(workspace=workspace, member=invitee, is_active=True).exists()
    assert ProjectMember.objects.get(project=project, member=invitee).role == 15
    assert not PendingInviteGrant.objects.filter(pk=grant.pk).exists()
    assert not WorkspaceMemberInvite.objects.filter(pk=invite.pk).exists()
    label.refresh_from_db()
    project.refresh_from_db()
    if kind == "label_owner":
        assert label.default_assignee_id == invitee.pk
    elif kind == "project_default_assignee":
        assert project.default_assignee_id == invitee.pk
    elif kind == "project_lead":
        assert project.project_lead_id == invitee.pk
    elif kind == "issue_assignee":
        assert IssueAssignee.objects.filter(issue=issue, assignee=invitee).exists()
        activity = tasks["activity"].call_args.kwargs
        assert activity["actor_id"] == str(create_user.pk)
        assert json.loads(activity["requested_data"])["assignee_ids"] == [str(invitee.pk)]
        assert json.loads(activity["current_instance"])["assignee_ids"] == []
    tasks["notification"].assert_called_once()
    assert tasks["notification"].call_args.kwargs["inviter_id"] == str(create_user.pk)


@pytest.mark.parametrize("kind", SINGLE_KINDS)
def test_does_not_overwrite_newer_field(workspace, project, invite, invitee, label, create_user, kind):
    make_grant(invite, project, kind, label if kind == "label_owner" else None)
    if kind == "label_owner":
        Label.objects.filter(pk=label.pk).update(default_assignee=create_user)
    else:
        field = "default_assignee" if kind == "project_default_assignee" else "project_lead"
        Project.objects.filter(pk=project.pk).update(**{field: create_user})
    apply_pending_grants(invitee, [invite])
    label.refresh_from_db()
    project.refresh_from_db()
    assert (label.default_assignee_id if kind == "label_owner" else getattr(project, f"{field}_id")) == create_user.pk
    assert ProjectMember.objects.filter(project=project, member=invitee, role=15).exists()


@pytest.mark.parametrize("active,role", [(True, 20), (False, 20), (False, 15), (False, 5)])
def test_membership_reactivation_never_lowers_role(workspace, project, invite, invitee, active, role):
    ProjectMember.objects.create(project=project, member=invitee, role=role, is_active=active)
    make_grant(invite, project)
    apply_pending_grants(invitee, [invite])
    member = ProjectMember.objects.get(project=project, member=invitee)
    assert member.is_active
    assert member.role == max(role, 15)


def test_intake_fallback_then_owner(workspace, project, invite, invitee, label, create_user):
    Project.objects.filter(pk=project.pk).update(default_assignee=create_user)
    project.refresh_from_db()
    make_grant(invite, project, "label_owner", label)
    assert label.default_assignee_id is None
    assert intake_assignee_id(project, label) == create_user.pk
    apply_pending_grants(invitee, [invite])
    label.refresh_from_db()
    assert intake_assignee_id(project, label) == invitee.pk


@pytest.mark.parametrize("missing", ["project", "label", "issue"])
def test_missing_target_is_consumed_without_membership(workspace, project, invite, invitee, label, issue, missing):
    target = issue if missing == "issue" else label
    kind = "issue_assignee" if missing == "issue" else "label_owner"
    grant = make_grant(invite, project, kind, target)
    model = {"project": Project, "label": Label, "issue": Issue}[missing]
    model.objects.filter(pk=project.pk if missing == "project" else target.pk).update(deleted_at=timezone.now())
    apply_pending_grants(invitee, [invite])
    assert not PendingInviteGrant.objects.filter(pk=grant.pk).exists()
    assert not ProjectMember.objects.filter(project=project, member=invitee).exists()


@pytest.mark.parametrize("invalid", ["kind", "project", "target", "unexpected_target", "email"])
def test_invalid_payload(session_client, workspace, project, invalid):
    data = body(project)
    if invalid == "kind":
        data["kind"] = "unknown"
    elif invalid == "project":
        data["project_id"] = str(uuid4())
    elif invalid == "target":
        data.update(kind="label_owner", target_id=str(uuid4()))
    elif invalid == "unexpected_target":
        data["target_id"] = str(uuid4())
    else:
        data["email"] = "invalid"
    response = session_client.post(url(workspace), data, format="json")
    assert response.status_code == 400, response.data
    assert not PendingInviteGrant.objects.exists()


def test_notification_failure_does_not_break_acceptance(
    session_client,
    workspace,
    project,
    invite,
    invitee,
    tasks,
    django_capture_on_commit_callbacks,
):
    make_grant(invite, project)
    tasks["notification"].side_effect = RuntimeError("mail broker unavailable")
    with django_capture_on_commit_callbacks(execute=True):
        accept("join", session_client, invitee, workspace, invite)
    assert ProjectMember.objects.filter(project=project, member=invitee, is_active=True).exists()


def test_one_summary_for_multiple_grants(
    workspace, project, invite, invitee, label, tasks, django_capture_on_commit_callbacks
):
    make_grant(invite, project, "label_owner", label)
    make_grant(invite, project, "project_lead")
    with django_capture_on_commit_callbacks(execute=True):
        apply_pending_grants(invitee, [invite])
        apply_pending_grants(invitee, [invite])
    tasks["notification"].assert_called_once()
    assert len(tasks["notification"].call_args.kwargs["grants"]) == 2


@pytest.mark.parametrize("kind", ["issue_assignee", "project_member"])
def test_additive_kinds_allow_different_emails(session_client, workspace, project, invite, issue, kind):
    target = issue if kind == "issue_assignee" else None
    first = make_grant(invite, project, kind, target)
    response = session_client.post(
        url(workspace), body(project, kind, target, email="second@example.test"), format="json"
    )
    assert response.status_code == 201, response.data
    assert PendingInviteGrant.objects.filter(pk=first.pk).exists()
    assert PendingInviteGrant.objects.filter(project=project, kind=kind).count() == 2


def test_issue_grant_preserves_other_assignees_and_is_idempotent(
    workspace,
    project,
    invite,
    invitee,
    issue,
    create_user,
    tasks,
    django_capture_on_commit_callbacks,
):
    IssueAssignee.objects.create(issue=issue, assignee=create_user, project=project, workspace=workspace)
    make_grant(invite, project, "issue_assignee", issue)
    with django_capture_on_commit_callbacks(execute=True):
        apply_pending_grants(invitee, [invite])
        make_grant(invite, project, "issue_assignee", issue)
        apply_pending_grants(invitee, [invite])
    assert set(IssueAssignee.objects.filter(issue=issue).values_list("assignee_id", flat=True)) == {
        create_user.pk,
        invitee.pk,
    }
    tasks["activity"].assert_called_once()
    data = tasks["activity"].call_args.kwargs
    assert json.loads(data["current_instance"])["assignee_ids"] == [str(create_user.pk)]
    assert set(json.loads(data["requested_data"])["assignee_ids"]) == {str(create_user.pk), str(invitee.pk)}


@pytest.mark.parametrize("kind", ["label_owner", "issue_assignee"])
def test_target_from_another_project_rejected(session_client, workspace, project, label, issue, kind):
    other = Project.objects.create(name="Other", identifier="OTH", workspace=workspace)
    target = label if kind == "label_owner" else issue
    response = session_client.post(url(workspace), body(other, kind, target), format="json")
    assert response.status_code == 400
    assert not PendingInviteGrant.objects.exists()


def test_guest_cannot_list(session_client, workspace, project, create_user):
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=5)
    assert session_client.get(url(workspace), {"project_id": str(project.pk)}).status_code == 403


def test_notification_email_uses_instance_configuration(create_user):
    from plane.bgtasks.pending_invite_grant_task import pending_invite_grants_notification

    with (
        patch("plane.bgtasks.pending_invite_grant_task.get_email_configuration") as config,
        patch("plane.bgtasks.pending_invite_grant_task.get_connection") as connection,
        patch("plane.bgtasks.pending_invite_grant_task.EmailMultiAlternatives") as mail,
    ):
        config.return_value = ("smtp.example.test", "user", "password", "587", "1", "0", "axios@example.test")
        pending_invite_grants_notification.run(
            str(create_user.pk), "invitee@example.test", "CCI", ["Campus label owner: <Ikeja> — Gamma"]
        )
        connection.assert_called_once_with(
            host="smtp.example.test", port=587, username="user", password="password", use_tls=True, use_ssl=False
        )
        assert mail.call_args.kwargs["to"] == [create_user.email]
        assert "<Ikeja>" in mail.call_args.kwargs["body"]
        html = mail.return_value.attach_alternative.call_args.args[0]
        assert "&lt;Ikeja&gt;" in html
        mail.return_value.send.assert_called_once()


def test_invalid_label_patch_keeps_pending_owner(session_client, workspace, project, label, invite, invitee):
    grant = make_grant(invite, project, "label_owner", label)
    response = session_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.pk}/issue-labels/{label.pk}/",
        {"default_assignee": str(invitee.pk)},
        format="json",
    )
    assert response.status_code == 400
    assert PendingInviteGrant.objects.filter(pk=grant.pk).exists()


@pytest.mark.parametrize("in_project", [False, True])
def test_list_needs_project_membership_unless_admin(session_client, workspace, project, create_user, in_project):
    # CCI: a workspace member outside a project must not see who it is waiting on.
    WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=15)
    ProjectMember.objects.filter(project=project, member=create_user).update(is_active=in_project, role=15)
    response = session_client.get(url(workspace), {"project_id": str(project.pk)})
    assert response.status_code == (200 if in_project else 403)


def test_declined_invite_is_replaced_and_resent(
    session_client, workspace, project, invite, tasks, django_capture_on_commit_callbacks
):
    old_grant = make_grant(invite, project, "project_lead")
    WorkspaceMemberInvite.objects.filter(pk=invite.pk).update(responded_at=timezone.now())
    with django_capture_on_commit_callbacks(execute=True):
        response = session_client.post(url(workspace), body(project), format="json")
    assert response.status_code == 201, response.data
    assert str(response.data["invite_id"]) != str(invite.pk)
    assert not WorkspaceMemberInvite.objects.filter(pk=invite.pk).exists()
    assert not PendingInviteGrant.objects.filter(pk=old_grant.pk).exists()
    tasks["invitation"].assert_called_once()


def test_guest_invite_is_raised_to_member_for_a_grant(session_client, workspace, project, invite, invitee):
    WorkspaceMemberInvite.objects.filter(pk=invite.pk).update(role=5)
    response = session_client.post(url(workspace), body(project), format="json")
    assert response.status_code == 201, response.data
    assert WorkspaceMemberInvite.objects.get(pk=invite.pk).role == 15
    invite.refresh_from_db()
    accept("join", session_client, invitee, workspace, invite)
    assert WorkspaceMember.objects.get(workspace=workspace, member=invitee).role == 15
    assert ProjectMember.objects.get(project=project, member=invitee).role == 15


def test_public_api_revoke_removes_grants(api_key_client, workspace, project, invite):
    grant = make_grant(invite, project)
    response = api_key_client.delete(f"/api/v1/workspaces/{workspace.slug}/invitations/{invite.pk}/")
    assert response.status_code == 204, response.data
    assert not PendingInviteGrant.objects.filter(pk=grant.pk).exists()

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
from collections import defaultdict
from functools import partial

from django.db import transaction
from django.utils import timezone

from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.pending_invite_grant_task import pending_invite_grants_notification
from plane.db.models import Issue, IssueAssignee, Label, PendingInviteGrant, Project, ProjectMember
from plane.utils.exception_logger import log_exception


def enqueue_grant_task(task, **kwargs):
    # CCI: broker/email outages must never turn a successful acceptance into an error.
    try:
        task.delay(**kwargs)
    except Exception as exc:
        log_exception(exc)


def cancel_pending_grants(project_id, kind, target_id=None):
    # CCI: called only after a valid explicit field write, including a write of null.
    PendingInviteGrant.objects.filter(
        project_id=project_id,
        kind=kind,
        target_id=target_id,
        invite__accepted=False,
        invite__deleted_at__isnull=True,
    ).delete()


def apply_pending_grants(user, invites):
    """CCI: consume pending picker choices in all three invitation acceptance paths."""
    for invite in invites:
        notifications = defaultdict(list)
        grants = PendingInviteGrant.objects.filter(invite=invite, email__iexact=user.email)
        for candidate in grants:
            with transaction.atomic():
                # CCI: use the same project lock as replacement and explicit field writes.
                project = (
                    Project.objects.select_for_update()
                    .filter(pk=candidate.project_id, workspace_id=invite.workspace_id)
                    .first()
                )
                grant = (
                    PendingInviteGrant.objects.select_for_update(of=("self",))
                    .filter(pk=candidate.pk, invite__deleted_at__isnull=True)
                    .first()
                )
                if grant is None:
                    continue
                if project is None:
                    PendingInviteGrant.objects.filter(pk=grant.pk).delete()
                    continue
                target = None
                if grant.kind in ("label_owner", "issue_assignee"):
                    model = Label if grant.kind == "label_owner" else Issue
                    target = model.objects.filter(pk=grant.target_id, project=project).first()
                    if target is None:
                        PendingInviteGrant.objects.filter(pk=grant.pk).delete()
                        continue
                member, _ = ProjectMember.objects.get_or_create(
                    project=project,
                    member=user,
                    defaults={"workspace_id": project.workspace_id, "role": 15},
                )
                ProjectMember.objects.filter(pk=member.pk).update(is_active=True, role=max(15, member.role))
                granted = "Project member"
                if grant.kind == "label_owner":
                    if Label.objects.filter(pk=target.pk, default_assignee__isnull=True).update(default_assignee=user):
                        granted = f"Campus label owner: {target.name}"
                elif grant.kind in ("project_default_assignee", "project_lead"):
                    field = "default_assignee" if grant.kind == "project_default_assignee" else "project_lead"
                    if Project.objects.filter(pk=project.pk, **{f"{field}__isnull": True}).update(**{field: user}):
                        granted = grant.get_kind_display()
                elif grant.kind == "issue_assignee":
                    previous = list(IssueAssignee.objects.filter(issue=target).values_list("assignee_id", flat=True))
                    _, created = IssueAssignee.objects.get_or_create(
                        issue=target,
                        assignee=user,
                        defaults={"workspace_id": project.workspace_id, "project": project},
                    )
                    if created:
                        granted = f"Work item assignee: {target.name}"
                        transaction.on_commit(
                            partial(
                                enqueue_grant_task,
                                issue_activity,
                                type="issue.activity.updated",
                                requested_data=json.dumps(
                                    {"assignee_ids": [str(uid) for uid in previous] + [str(user.id)]}
                                ),
                                current_instance=json.dumps({"assignee_ids": [str(uid) for uid in previous]}),
                                actor_id=str(grant.created_by_id) if grant.created_by_id else None,
                                issue_id=str(target.pk),
                                project_id=str(project.pk),
                                epoch=int(timezone.now().timestamp()),
                                notification=True,
                            )
                        )
                PendingInviteGrant.objects.filter(pk=grant.pk).delete()
                if grant.created_by_id:
                    notifications[str(grant.created_by_id)].append(f"{granted} — {project.name}")
        for inviter_id, granted in notifications.items():
            transaction.on_commit(
                partial(
                    enqueue_grant_task,
                    pending_invite_grants_notification,
                    inviter_id=inviter_id,
                    email=user.email,
                    workspace_name=invite.workspace.name,
                    grants=granted,
                )
            )

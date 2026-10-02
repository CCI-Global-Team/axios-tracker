# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: the Releases domain (GAM-400).

Every state change here goes through ``Issue.save()`` so ``completed_at`` stays in step, and is logged
as an ordinary state update so the work item's activity reads the same as a hand move. Automation only
ever moves an item into Released or back out of it; Done belongs to people.
"""

# Python imports
import json
import uuid
from dataclasses import dataclass, field

# Django imports
from django.db import transaction
from django.db.models import Case, Count, IntegerField, Q, Value, When
from django.utils import timezone

# Module imports
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    DEFAULT_RELEASE_CHECKLIST,
    OPEN_RELEASE_STATUSES,
    RELEASED_STATE_NAME,
    Issue,
    Project,
    Release,
    ReleaseIssue,
    ReleaseStatus,
    State,
    StateGroup,
)

READY_FOR_TEST_STATE_NAME = "Ready for Test"
MANUAL_VIA = "manual"


class ReleaseError(ValueError):
    """The release is not in a status that allows the action."""


class ReleaseConflict(ValueError):
    """Some items already sit in another open release."""

    def __init__(self, issue_ids):
        self.issue_ids = [str(i) for i in issue_ids]
        super().__init__(f"Already in another open release: {', '.join(self.issue_ids)}")


@dataclass
class _Context:
    actor_id: str
    origin: str | None = None
    epoch: int = field(default_factory=lambda: int(timezone.now().timestamp()))


def default_checklist():
    return [
        {"id": str(uuid.uuid4()), "text": text, "done": False, "done_at": None, "done_by": None}
        for text in DEFAULT_RELEASE_CHECKLIST
    ]


def issue_key(issue):
    return f"{issue.project.identifier}-{issue.sequence_id}"


def _state_named(project_id, name):
    return State.objects.filter(project_id=project_id, name__iexact=name).first()


def released_state(project):
    return _state_named(getattr(project, "id", project), RELEASED_STATE_NAME)


def ready_for_test_state(project):
    return _state_named(getattr(project, "id", project), READY_FOR_TEST_STATE_NAME)


def open_release_for(issue):
    return (
        ReleaseIssue.objects.filter(
            issue_id=getattr(issue, "id", issue),
            release__status__in=OPEN_RELEASE_STATUSES,
            release__deleted_at__isnull=True,
        )
        .select_related("release")
        .first()
    )


def _dispatch(ctx, **kwargs):
    # The activity worker reads the database, so it must not run before this transaction commits.
    transaction.on_commit(
        lambda: issue_activity.delay(
            actor_id=str(ctx.actor_id),
            epoch=ctx.epoch,
            notification=True,
            origin=ctx.origin,
            **kwargs,
        )
    )


def _move(issue, new_state, ctx):
    """Move an item to ``new_state`` exactly as a PATCH of state_id would."""
    old_state_id = issue.state_id
    if new_state is None or old_state_id == new_state.id:
        return False
    issue.state = new_state
    issue.save(update_fields=["state", "updated_at"])
    _dispatch(
        ctx,
        type="issue.activity.updated",
        requested_data=json.dumps({"state_id": str(new_state.id)}),
        current_instance=json.dumps({"state_id": str(old_state_id) if old_state_id else None}),
        issue_id=str(issue.id),
        project_id=str(issue.project_id),
    )
    return True


def _log_link(ctx, release, issue_id, created):
    _dispatch(
        ctx,
        type="release.activity.created" if created else "release.activity.deleted",
        requested_data=json.dumps({"release_id": str(release.id)}),
        current_instance=None if created else json.dumps({"release_name": release.name}),
        issue_id=str(issue_id),
        project_id=str(release.project_id),
    )


def _lock(release):
    return Release.objects.select_for_update().get(pk=release.pk)


def _lock_project(project_id):
    """Serialize release membership changes per project: shipping and planning both decide which
    open release an item belongs to, and two of them racing could put an item in two releases or
    create the same 'Shipped <date>' release twice."""
    Project.objects.select_for_update().filter(pk=project_id).first()


def _close_if_all_shipped(release, now):
    links = ReleaseIssue.objects.filter(release=release)
    if links.exists() and not links.filter(shipped_at__isnull=True).exists() and release.is_open:
        release.status = ReleaseStatus.RELEASED
        release.released_at = now
        release.save(update_fields=["status", "released_at", "updated_at"])
        return True
    return False


def _ship_link(link, via, now, released, ctx):
    """Mark one link shipped and move its item to Released. Returns True when the item moved."""
    issue = link.issue
    link.shipped_at = now
    link.shipped_via = via
    moved = False
    if (
        released is not None
        and issue.state is not None
        and issue.state.group not in (StateGroup.COMPLETED.value, StateGroup.CANCELLED.value)
    ):
        link.previous_state_id = issue.state_id
        moved = _move(issue, released, ctx)
    link.save(update_fields=["shipped_at", "shipped_via", "previous_state", "updated_at"])
    return moved


def _project_open_release(project, actor, now):
    """The release unplanned shipments land in: frozen before planning, newest first, else a new one."""
    release = (
        Release.objects.filter(project_id=project.id, status__in=OPEN_RELEASE_STATUSES)
        .annotate(
            _rank=Case(
                When(status=ReleaseStatus.FROZEN, then=Value(0)),
                default=Value(1),
                output_field=IntegerField(),
            )
        )
        .order_by("_rank", "-created_at")
        .first()
    )
    if release is not None:
        return release
    base = f"Shipped {now.date().isoformat()}"
    name, n = base, 1
    while Release.objects.filter(project_id=project.id, name=name).exists():
        n += 1
        name = f"{base} ({n})"
    return Release.objects.create(
        name=name,
        project_id=project.id,
        workspace_id=project.workspace_id,
        status=ReleaseStatus.FROZEN,
        owned_by=actor,
        checklist=default_checklist(),
        created_by=actor,
        updated_by=actor,
    )


def open_conflicts(release):
    """Items of ``release`` that already sit in another open release — what reopening or un-cancelling
    it would put in two open releases at once."""
    ids = ReleaseIssue.objects.filter(release=release).values_list("issue_id", flat=True)
    return sorted(
        set(
            ReleaseIssue.objects.filter(
                issue_id__in=ids,
                release__status__in=OPEN_RELEASE_STATUSES,
                release__deleted_at__isnull=True,
            )
            .exclude(release_id=release.id)
            .values_list("issue_id", flat=True)
        ),
        key=str,
    )


def add_issues(release, issue_ids, actor, origin=None):
    """Plan items into an open release. Raises ReleaseConflict if any is in another open release."""
    ctx = _Context(actor_id=actor.id, origin=origin)
    with transaction.atomic():
        _lock_project(release.project_id)
        release = _lock(release)
        if not release.is_open:
            raise ReleaseError("Items can only be added to a planning or frozen release")
        ids = set(
            Issue.issue_objects.filter(project_id=release.project_id, pk__in=issue_ids).values_list("id", flat=True)
        )
        conflicts = set(
            ReleaseIssue.objects.filter(
                issue_id__in=ids,
                release__status__in=OPEN_RELEASE_STATUSES,
                release__deleted_at__isnull=True,
            )
            .exclude(release_id=release.id)
            .values_list("issue_id", flat=True)
        )
        if conflicts:
            raise ReleaseConflict(sorted(conflicts, key=str))
        existing = set(
            ReleaseIssue.objects.filter(release=release, issue_id__in=ids).values_list("issue_id", flat=True)
        )
        new_ids = [i for i in ids if i not in existing]
        ReleaseIssue.objects.bulk_create(
            [
                ReleaseIssue(
                    release=release,
                    issue_id=issue_id,
                    project_id=release.project_id,
                    workspace_id=release.workspace_id,
                    created_by=actor,
                    updated_by=actor,
                )
                for issue_id in new_ids
            ]
        )
        for issue_id in new_ids:
            _log_link(ctx, release, issue_id, created=True)
        return [str(i) for i in new_ids]


def remove_issue(release, issue_id, actor, origin=None):
    ctx = _Context(actor_id=actor.id, origin=origin)
    with transaction.atomic():
        release = _lock(release)
        if not release.is_open:
            raise ReleaseError("Items can only be removed from a planning or frozen release")
        links = ReleaseIssue.objects.filter(release=release, issue_id=issue_id)
        if not links.exists():
            return False
        links.delete()
        _log_link(ctx, release, issue_id, created=False)
        # Dropping the last unshipped item can leave a release whose every item has shipped.
        _close_if_all_shipped(release, timezone.now())
        return True


def ship_issues(project, issues, via, actor, now=None, origin=None):
    """Record that ``issues`` reached production through ``via``.

    Idempotent: an item already shipped in its open release, or (when it is in no open release) one
    shipped through the same ``via`` or with a release that has since closed, is reported as
    ``already`` and left untouched.
    """
    now = now or timezone.now()
    ctx = _Context(actor_id=actor.id, origin=origin)
    released = released_state(project)
    results = []
    with transaction.atomic():
        _lock_project(project.id)
        touched = {}
        for issue in issues:
            summary = {
                "key": issue_key(issue),
                "issue_id": str(issue.id),
                "release_id": None,
                "moved": False,
                "unplanned": False,
                "already": False,
            }
            link = open_release_for(issue)
            if link is None:
                # Already shipped: a replay of the same push, or the item went out with a release that
                # has since closed (GAM ships backend first, then the admin promotion names it again).
                # Checked only when the item is in no open release, so a follow-up planned into a new
                # release still ships there.
                replay = (
                    ReleaseIssue.objects.filter(issue_id=issue.id, release__deleted_at__isnull=True)
                    .exclude(shipped_at__isnull=True)
                    .filter(Q(shipped_via=via) | Q(release__status=ReleaseStatus.RELEASED))
                    .order_by("-shipped_at")
                    .first()
                )
                if replay is not None:
                    summary.update(release_id=str(replay.release_id), unplanned=replay.is_unplanned, already=True)
                    results.append(summary)
                    continue
                target = _project_open_release(project, actor, now)
                target = touched.get(target.id) or _lock(target)
                link = ReleaseIssue.objects.create(
                    release=target,
                    issue=issue,
                    project_id=project.id,
                    workspace_id=project.workspace_id,
                    is_unplanned=True,
                    created_by=actor,
                    updated_by=actor,
                )
                _log_link(ctx, target, issue.id, created=True)
            else:
                link.release = touched.get(link.release_id) or _lock(link.release)
            touched[link.release_id] = link.release
            summary.update(release_id=str(link.release_id), unplanned=link.is_unplanned)

            if link.shipped_at is not None:
                summary["already"] = True
            else:
                link.issue = issue
                summary["moved"] = _ship_link(link, via, now, released, ctx)
            results.append(summary)

        for release in touched.values():
            _close_if_all_shipped(release, now)
    return results


def mark_released(release, actor, origin=None):
    """The manual fallback: ship every unshipped item and close the release."""
    now = timezone.now()
    ctx = _Context(actor_id=actor.id, origin=origin)
    with transaction.atomic():
        release = _lock(release)
        if not release.is_open:
            raise ReleaseError("Only a planning or frozen release can be marked released")
        released = released_state(release.project_id)
        results = []
        links = ReleaseIssue.objects.filter(release=release, shipped_at__isnull=True).select_related(
            "issue", "issue__state", "issue__project"
        )
        for link in links:
            moved = _ship_link(link, MANUAL_VIA, now, released, ctx)
            results.append({"key": issue_key(link.issue), "issue_id": str(link.issue_id), "moved": moved})
        release.status = ReleaseStatus.RELEASED
        release.released_at = now
        release.save(update_fields=["status", "released_at", "updated_at"])
        return {"release_id": str(release.id), "status": release.status, "results": results}


def _undo_shipping(release, ctx, prefer_ready_for_test):
    """Move shipped items still in Released back; leave any QA has already moved on."""
    released = released_state(release.project_id)
    ready = ready_for_test_state(release.project_id)
    restored, left_alone = [], []
    links = ReleaseIssue.objects.filter(release=release, shipped_at__isnull=False).select_related(
        "issue", "issue__state", "issue__project", "previous_state"
    )
    for link in links:
        issue = link.issue
        entry = {"key": issue_key(issue), "issue_id": str(issue.id)}
        if prefer_ready_for_test:
            target = ready or link.previous_state
        else:
            target = link.previous_state or ready
        if released is None or issue.state_id != released.id or target is None:
            left_alone.append({**entry, "state": issue.state.name if issue.state else None})
            continue
        _move(issue, target, ctx)
        link.shipped_at = None
        link.shipped_via = ""
        link.previous_state = None
        link.save(update_fields=["shipped_at", "shipped_via", "previous_state", "updated_at"])
        restored.append({**entry, "state": target.name})
    return restored, left_alone


def reopen(release, actor, origin=None):
    ctx = _Context(actor_id=actor.id, origin=origin)
    with transaction.atomic():
        _lock_project(release.project_id)
        release = _lock(release)
        if release.status not in (ReleaseStatus.RELEASED, ReleaseStatus.ROLLED_BACK):
            raise ReleaseError("Only a released or rolled back release can be reopened")
        conflicts = open_conflicts(release)
        if conflicts:
            raise ReleaseConflict(conflicts)
        restored, left_alone = _undo_shipping(release, ctx, prefer_ready_for_test=False)
        release.status = ReleaseStatus.FROZEN
        release.released_at = None
        release.save(update_fields=["status", "released_at", "updated_at"])
        return {"release_id": str(release.id), "status": release.status, "restored": restored, "left_alone": left_alone}


def roll_back(release, actor, origin=None):
    ctx = _Context(actor_id=actor.id, origin=origin)
    with transaction.atomic():
        release = _lock(release)
        if release.status != ReleaseStatus.RELEASED:
            raise ReleaseError("Only a released release can be rolled back")
        restored, left_alone = _undo_shipping(release, ctx, prefer_ready_for_test=True)
        release.status = ReleaseStatus.ROLLED_BACK
        release.save(update_fields=["status", "updated_at"])
        return {"release_id": str(release.id), "status": release.status, "restored": restored, "left_alone": left_alone}


# Read side, shared by the app and the public API.


def _ready_q(project_id, prefix=""):
    """Items QA can take: completed, or started at or past the project's Ready for Test state."""
    q = Q(**{f"{prefix}state__group": StateGroup.COMPLETED.value})
    ready = ready_for_test_state(project_id)
    if ready is not None:
        q |= Q(**{f"{prefix}state__group": StateGroup.STARTED.value, f"{prefix}state__sequence__gte": ready.sequence})
    return q


def with_counts(queryset, project_id):
    live = Q(release_issues__deleted_at__isnull=True, release_issues__issue__deleted_at__isnull=True)
    return queryset.annotate(
        total_items=Count("release_issues", filter=live, distinct=True),
        shipped_items=Count("release_issues", filter=live & Q(release_issues__shipped_at__isnull=False), distinct=True),
        unplanned_items=Count("release_issues", filter=live & Q(release_issues__is_unplanned=True), distinct=True),
        ready_items=Count(
            "release_issues", filter=live & _ready_q(project_id, "release_issues__issue__"), distinct=True
        ),
    )


def _issue_row(issue):
    state = issue.state
    return {
        "id": str(issue.id),
        "sequence_id": issue.sequence_id,
        "project_id": str(issue.project_id),
        "project_identifier": issue.project.identifier,
        "name": issue.name,
        "priority": issue.priority,
        "state": (
            {"id": str(state.id), "name": state.name, "group": state.group, "color": state.color} if state else None
        ),
        "assignee_ids": [str(a.assignee_id) for a in issue.issue_assignee.all() if a.deleted_at is None],
        "label_ids": [str(lb.label_id) for lb in issue.label_issue.all() if lb.deleted_at is None],
    }


def _issue_prefetch(prefix=""):
    return [f"{prefix}issue_assignee", f"{prefix}label_issue"]


def release_items(release):
    links = (
        ReleaseIssue.objects.filter(release=release, issue__deleted_at__isnull=True)
        .select_related("issue", "issue__state", "issue__project", "previous_state")
        .prefetch_related(*_issue_prefetch("issue__"))
        .order_by("issue__sequence_id")
    )
    return [
        {
            **_issue_row(link.issue),
            "release_issue_id": str(link.id),
            "shipped_at": link.shipped_at,
            "shipped_via": link.shipped_via,
            "is_unplanned": link.is_unplanned,
            "previous_state_name": link.previous_state.name if link.previous_state else None,
        }
        for link in links
    ]


def release_candidates(project_id, search=None, limit=50):
    """Ready-for-Test-and-later items not yet in an open release; with ``search``, any matching item."""
    issues = Issue.issue_objects.filter(project_id=project_id)
    if search:
        term = search.strip()
        match = Q(name__icontains=term)
        number = term.rsplit("-", 1)[-1]
        if number.isdigit():
            match |= Q(sequence_id=int(number))
        issues = issues.filter(match)
    else:
        ready = ready_for_test_state(project_id)
        if ready is None:
            return []
        in_open_release = ReleaseIssue.objects.filter(
            project_id=project_id,
            release__status__in=OPEN_RELEASE_STATUSES,
            release__deleted_at__isnull=True,
        ).values("issue_id")
        issues = issues.filter(state__group=StateGroup.STARTED.value, state__sequence__gte=ready.sequence).exclude(
            id__in=in_open_release
        )
    issues = (
        issues.select_related("state", "project")
        .prefetch_related(*_issue_prefetch())
        .order_by("-sequence_id")
        .distinct()[:limit]
    )
    issues = list(issues)
    open_links = dict(
        ReleaseIssue.objects.filter(
            issue_id__in=[i.id for i in issues],
            release__status__in=OPEN_RELEASE_STATUSES,
            release__deleted_at__isnull=True,
        ).values_list("issue_id", "release_id")
    )
    return [
        {**_issue_row(issue), "open_release_id": str(open_links[issue.id]) if issue.id in open_links else None}
        for issue in issues
    ]


def current_release_link(issue_id):
    """The item's open release, else the one it was most recently in."""
    links = ReleaseIssue.objects.filter(issue_id=issue_id, release__deleted_at__isnull=True).select_related("release")
    link = links.filter(release__status__in=OPEN_RELEASE_STATUSES).first() or links.order_by("-created_at").first()
    if link is None:
        return None
    release = link.release
    return {
        "id": str(release.id),
        "name": release.name,
        "version": release.version,
        "status": release.status,
        "target_date": release.target_date,
        "released_at": release.released_at,
        "shipped_at": link.shipped_at,
        "shipped_via": link.shipped_via,
        "is_unplanned": link.is_unplanned,
    }

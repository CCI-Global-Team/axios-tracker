# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.contrib.postgres.expressions import ArraySubquery
from django.db.models import Count, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce

from plane.db.models import Initiative, InitiativeModule, Issue, Module
from plane.utils.issue_visibility import get_issue_project_permission_filters


def visible_modules(slug, user):
    return Module.objects.filter(
        workspace__slug=slug,
        project__workspace__slug=slug,
        project__deleted_at__isnull=True,
        project__archived_at__isnull=True,
        project__project_projectmember__member=user,
        project__project_projectmember__is_active=True,
        project__project_projectmember__deleted_at__isnull=True,
    ).distinct()


def visible_issues(slug, user, initiative_id):
    return Issue.issue_objects.filter(
        get_issue_project_permission_filters(user),
        workspace__slug=slug,
        project__project_projectmember__deleted_at__isnull=True,
        project__deleted_at__isnull=True,
        state__deleted_at__isnull=True,
        issue_module__module__initiative_modules__initiative_id=initiative_id,
        issue_module__deleted_at__isnull=True,
        issue_module__module_id__in=visible_modules(slug, user).values("id"),
        issue_module__module__initiative_modules__deleted_at__isnull=True,
        issue_module__module__initiative_modules__workspace__slug=slug,
    )


def initiatives_with_progress(slug, user):
    links = InitiativeModule.objects.filter(
        workspace__slug=slug,
        initiative_id=OuterRef("pk"),
        module_id__in=visible_modules(slug, user).values("id"),
    ).order_by()
    relation = "issue_module__module__initiative_modules__initiative_id"
    counts = visible_issues(slug, user, OuterRef("pk")).order_by().values(relation)
    aggregates = {"total_issues": Count("id", distinct=True)}
    for group in ("completed", "cancelled", "started", "unstarted", "backlog"):
        aggregates[f"{group}_issues"] = Count("id", filter=Q(state__group=group), distinct=True)
    counts = counts.annotate(**aggregates)
    return Initiative.objects.filter(workspace__slug=slug).annotate(
        module_ids=ArraySubquery(links.values("module_id").distinct()),
        project_ids=ArraySubquery(links.values("module__project_id").distinct()),
        **{key: Coalesce(Subquery(counts.values(key)[:1]), Value(0)) for key in aggregates},
    )

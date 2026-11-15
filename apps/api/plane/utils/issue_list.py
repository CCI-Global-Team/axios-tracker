# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db.models import F, Func, OuterRef, Subquery

from plane.db.models import CycleIssue, FileAsset, Issue, IssueLink
from plane.utils.timezone_converter import user_timezone_converter


def annotate_issue_list(queryset):
    return (
        queryset.annotate(
            cycle_id=Subquery(
                CycleIssue.objects.filter(issue=OuterRef("id"), deleted_at__isnull=True).values("cycle_id")[:1]
            )
        )
        .annotate(
            link_count=IssueLink.objects.filter(issue=OuterRef("id"))
            .order_by()
            .annotate(count=Func(F("id"), function="Count"))
            .values("count")
        )
        .annotate(
            attachment_count=FileAsset.objects.filter(
                issue_id=OuterRef("id"),
                entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
            )
            .order_by()
            .annotate(count=Func(F("id"), function="Count"))
            .values("count")
        )
        .annotate(
            sub_issues_count=Issue.issue_objects.filter(parent=OuterRef("id"))
            .order_by()
            .annotate(count=Func(F("id"), function="Count"))
            .values("count")
        )
        .distinct()
    )


def serialize_issue_list(queryset, user):
    issues = queryset.values(
        "id",
        "name",
        "state_id",
        "sort_order",
        "completed_at",
        "estimate_point",
        "priority",
        "start_date",
        "target_date",
        "sequence_id",
        "project_id",
        "parent_id",
        "cycle_id",
        "module_ids",
        "label_ids",
        "assignee_ids",
        "sub_issues_count",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "attachment_count",
        "link_count",
        "is_draft",
        "archived_at",
        "deleted_at",
    )
    datetime_fields = ["created_at", "updated_at"]
    issues = user_timezone_converter(issues, datetime_fields, user.user_timezone)
    return issues

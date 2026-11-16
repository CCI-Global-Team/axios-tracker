# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
from collections import Counter
from uuid import UUID

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Exists, OuterRef
from django.utils import timezone

from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import IntakeIssue, Issue, IssueAssignee, IssueLabel, Label
from plane.utils.intake_campus import CAMPUS_PARENT_LABEL, campus_from_description, campus_label, intake_assignee_id


class Command(BaseCommand):
    help = "Backfill project campus labels from intake support descriptions (dry run by default)."

    def add_arguments(self, parser):
        parser.add_argument("--project", type=UUID, required=True)
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--assign", action="store_true", help="Assign unassigned Pending items to campus owners.")

    def handle(self, *args, **options):
        counts = Counter()
        campus_links = IssueLabel.objects.filter(
            issue_id=OuterRef("issue_id"),
            label__parent__name=CAMPUS_PARENT_LABEL,
            label__parent__parent__isnull=True,
            label__deleted_at__isnull=True,
            label__parent__deleted_at__isnull=True,
        )
        items = (
            IntakeIssue.objects.filter(project_id=options["project"])
            .annotate(has_campus=Exists(campus_links))
            .filter(has_campus=False)
            .select_related("issue")
        )
        for item in items.iterator():
            campus = campus_from_description(item.issue.description_html)
            if not campus:
                continue
            if options["apply"]:
                with transaction.atomic():
                    Issue.objects.select_for_update().get(pk=item.issue_id)
                    if IssueLabel.objects.filter(
                        issue_id=item.issue_id,
                        label__parent__name=CAMPUS_PARENT_LABEL,
                        label__parent__parent__isnull=True,
                        label__deleted_at__isnull=True,
                        label__parent__deleted_at__isnull=True,
                    ).exists():
                        continue
                    label = campus_label(item.project_id, item.workspace_id, campus)
                    IssueLabel.objects.get_or_create(
                        issue_id=item.issue_id,
                        label=label,
                        project_id=item.project_id,
                        workspace_id=item.workspace_id,
                    )
            counts[campus] += 1
        mode = "Applied" if options["apply"] else "Dry run"
        for campus, count in sorted(counts.items()):
            self.stdout.write(f"{campus}: {count}")
        self.stdout.write(f"{mode} total: {sum(counts.values())}")

        # CCI: labelling runs first; assignment also considers campuses linked in an earlier run.
        if options["assign"]:
            self.assign_owners(options)

    def assign_owners(self, options):
        counts = Counter()
        items = IntakeIssue.objects.filter(project_id=options["project"], status=-2).select_related("project")
        for item in items.iterator():
            with transaction.atomic():
                issue = Issue.objects.select_for_update().get(pk=item.issue_id)
                if not IntakeIssue.objects.filter(pk=item.pk, status=-2).exists():
                    continue
                if IssueAssignee.objects.filter(issue=issue, deleted_at__isnull=True).exists():
                    continue
                link = (
                    IssueLabel.objects.filter(
                        issue=issue,
                        deleted_at__isnull=True,
                        label__parent__name=CAMPUS_PARENT_LABEL,
                        label__parent__parent__isnull=True,
                        label__deleted_at__isnull=True,
                        label__parent__deleted_at__isnull=True,
                    )
                    .select_related("label__default_assignee")
                    .first()
                )
                label = link.label if link else None
                if label is None and not options["apply"]:
                    # CCI: preview labels this invocation would attach without creating them.
                    campus = campus_from_description(issue.description_html)
                    if campus:
                        label = (
                            Label.objects.filter(project_id=item.project_id, name__iexact=campus)
                            .exclude(name__iexact=CAMPUS_PARENT_LABEL)
                            .select_related("default_assignee")
                            .first()
                        )
                # CCI: the project default must never be used for historical assignment.
                if label is None or label.default_assignee_id is None:
                    continue
                owner_id = intake_assignee_id(item.project, label)
                if owner_id != label.default_assignee_id:
                    continue
                if options["apply"]:
                    IssueAssignee.objects.create(
                        issue=issue,
                        assignee_id=owner_id,
                        project_id=item.project_id,
                        workspace_id=item.workspace_id,
                    )
                    issue_activity.delay(
                        type="issue.activity.updated",
                        requested_data=json.dumps({"assignee_ids": [str(owner_id)]}),
                        current_instance=json.dumps({"assignee_ids": []}),
                        issue_id=str(issue.id),
                        actor_id=str(issue.created_by_id),
                        project_id=str(item.project_id),
                        epoch=int(timezone.now().timestamp()),
                        notification=True,
                        subscriber=False,
                    )
                counts[label.default_assignee.display_name] += 1
        for owner, count in sorted(counts.items()):
            self.stdout.write(f"{owner}: {count}")
        mode = "Assigned" if options["apply"] else "Assign dry run"
        self.stdout.write(f"{mode} total: {sum(counts.values())}")

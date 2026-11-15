# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from collections import Counter
from uuid import UUID

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Exists, OuterRef

from plane.db.models import IntakeIssue, Issue, IssueLabel
from plane.utils.intake_campus import CAMPUS_PARENT_LABEL, campus_from_description, campus_label


class Command(BaseCommand):
    help = "Backfill project campus labels from intake support descriptions (dry run by default)."

    def add_arguments(self, parser):
        parser.add_argument("--project", type=UUID, required=True)
        parser.add_argument("--apply", action="store_true")

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

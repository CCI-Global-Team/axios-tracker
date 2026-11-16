# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import html
import re
from uuid import UUID

from django.db import transaction

from plane.db.models import Label, Project, ProjectMember

CAMPUS_PARENT_LABEL = "Campus"
CAMPUS_LABEL_COLOR = "#6B7280"


def campus_label(project_id, workspace_id, campus: str) -> Label | None:
    """CCI: support desk. The project's label for this campus: a child of "Campus", created on
    first use and matched case-insensitively after that."""
    campus = campus.strip()
    if not campus:
        return None
    if campus.casefold() == CAMPUS_PARENT_LABEL.casefold():
        raise ValueError("campus cannot use the reserved parent label name Campus")

    # CCI: Serialize case-insensitive creation because label uniqueness is case-sensitive.
    with transaction.atomic():
        Project.objects.select_for_update(no_key=True).get(pk=project_id)
        parent, _ = Label.objects.get_or_create(
            project_id=project_id,
            name=CAMPUS_PARENT_LABEL,
            defaults={"workspace_id": workspace_id, "color": CAMPUS_LABEL_COLOR},
        )
        label = Label.objects.filter(project_id=project_id, parent=parent, name__iexact=campus).first()
        if label is None:
            # CCI: Project/name uniqueness also covers labels outside the Campus hierarchy.
            label = Label.objects.filter(project_id=project_id, name__iexact=campus).exclude(pk=parent.pk).first()
            if label is None:
                label, _ = Label.objects.get_or_create(
                    project_id=project_id,
                    name=campus,
                    defaults={"workspace_id": workspace_id, "parent": parent, "color": CAMPUS_LABEL_COLOR},
                )
        # CCI: a project label that already has this name is reused where it is, never moved
        return label


def campus_from_description(description: str) -> str | None:
    match = re.search(r"<strong\b[^>]*>\s*Campus\s*</strong\s*>([^<]*)", description or "", re.IGNORECASE)
    return (html.unescape(match.group(1)).strip() or None) if match else None


def intake_assignee_id(project, label) -> UUID | None:
    """CCI: prefer an eligible campus owner, then the project's eligible default."""
    for member_id in (getattr(label, "default_assignee_id", None), project.default_assignee_id):
        if (
            member_id is not None
            and ProjectMember.objects.filter(
                project_id=project.id, member_id=member_id, is_active=True, role__gte=15
            ).exists()
        ):
            return member_id
    return None

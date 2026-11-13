# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db.models import Q


def get_issue_project_permission_filters(user):
    """Scope issues to active project members, respecting restricted guests."""
    return Q(
        Q(
            project__project_projectmember__role=5,
            project__guest_view_all_features=True,
        )
        | Q(
            project__project_projectmember__role=5,
            project__guest_view_all_features=False,
            created_by=user,
        )
        | Q(project__project_projectmember__role__gt=5),
        project__project_projectmember__member=user,
        project__project_projectmember__is_active=True,
    )

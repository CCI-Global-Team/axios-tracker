# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from plane.db.models import DISCIPLINE_VALUES, MemberDiscipline


def apply_invited_disciplines(user, invites):
    """CCI: turn the disciplines an admin set on an invite into the member's own row.

    Lives here because three separate paths turn an invite into a membership - a brand new signup,
    an existing user accepting one invite, and an existing user accepting all of them - and a
    discipline that only survives one of the three is worse than one that never worked, because
    nobody notices which path dropped it.

    Never overwrites an existing row: by the time someone is accepting an invite a lead may already
    have set their disciplines directly, and the newer assessment should win over whatever was
    typed into the invite form.
    """
    for invite in invites:
        wanted = [d for d in (invite.disciplines or []) if d in DISCIPLINE_VALUES]
        if not wanted:
            continue
        MemberDiscipline.objects.get_or_create(
            workspace_id=invite.workspace_id,
            member=user,
            defaults={
                "disciplines": wanted,
                "source": "set on invite",
                "created_by_id": invite.created_by_id,
                "updated_by_id": invite.created_by_id,
            },
        )

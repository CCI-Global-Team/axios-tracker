# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import datetime
import html
import re

# Django imports
from django.template.loader import render_to_string


def render_email(template_name, context):
    """CCI: render an email's HTML and its hand-written plain-text part.

    `template_name` has no extension: "emails/auth/magic_signin" renders magic_signin.html and
    magic_signin.txt. Text templates turn autoescape off, so an entity left in the result came
    from stored HTML (comment bodies); unescape it, since text/plain has no entities.
    """
    html_content = render_to_string(f"{template_name}.html", context)
    text_content = html.unescape(render_to_string(f"{template_name}.txt", context))
    text_content = re.sub(r"[ \t]+\n", "\n", text_content)
    text_content = re.sub(r"\n{3,}", "\n\n", text_content).strip() + "\n"
    return html_content, text_content


# Fields the updates email describes, in reading order, with the label a person sees. Scalar fields
# read "old -> new"; the rest are sets of things added and removed. Description changes never reach
# the email (notification_task skips them) and comments/mentions are rendered on their own.
_SCALAR_FIELDS = {
    "name": "Title",
    "state": "State",
    "priority": "Priority",
    "start_date": "Start date",
    "target_date": "Due date",
    "estimate_points": "Estimate",
    "estimate_categories": "Estimate",
    "estimate_time": "Estimate",
    "parent": "Parent",
    "cycles": "Cycle",
    "release": "Release",
    "archived_at": "Archive",
}
_SET_FIELDS = {
    "assignees": "Assignees",
    "labels": "Labels",
    "modules": "Modules",
    "blocked_by": "Blocked by",
    "blocking": "Blocking",
    "relates_to": "Related to",
    "duplicate": "Duplicate of",
    "start_before": "Starts before",
    "start_after": "Starts after",
    "finish_before": "Finishes before",
    "finish_after": "Finishes after",
    "implements": "Implements",
    "implemented_by": "Implemented by",
    "link": "Links",
}
# Reactions, votes and the rest say nothing a follower needs from an email, and their raw values
# ("128077", "archive") would read as noise.
_SKIPPED_FIELDS = {
    "description",
    "comment",
    "mention",
    "activity_time",
    "reaction",
    "vote",
    "draft",
    "intake",
    "public_link",
    "issue",
}
_MAX_LISTED = 3


def _values(change, key):
    # create_payload str()s every value, so a missing one arrives as "" or "None".
    return [v for v in (change or {}).get(key, []) if v not in ("", "None")]


def _display(field, value):
    if field in ("start_date", "target_date"):
        try:
            day = datetime.date.fromisoformat(value[:10])
            return f"{day.day} {day:%b %Y}"
        except ValueError:
            return value
    if field == "archived_at":
        return "Restored" if value == "restore" else "Archived"
    if field == "priority":
        return value.title()
    return value


def describe_changes(changes):
    """CCI: turn one actor's grouped activity into rows the updates email can show.

    Returns [{"label", "kind": "change"|"set", "old", "new", "added", "removed", "more_added",
    "more_removed"}]. Every field that can trigger the email gets a row, so the email never
    shows a name and a time over an empty box.
    """
    order = list(_SCALAR_FIELDS) + list(_SET_FIELDS)
    fields = [f for f in changes if f not in _SKIPPED_FIELDS]
    fields.sort(key=lambda f: order.index(f) if f in order else len(order))
    rows = []
    for field in fields:
        old, new = _values(changes[field], "old_value"), _values(changes[field], "new_value")
        if not old and not new:
            continue
        if field == "attachment":
            counts = [f"{len(new)} added"] if new else []
            counts += [f"{len(old)} removed"] if old else []
            rows.append({"label": "Attachments", "kind": "change", "old": "", "new": ", ".join(counts)})
        elif field == "archived_at":
            rows.append({"label": "Archive", "kind": "change", "old": "", "new": _display(field, (new or old)[-1])})
        elif field in _SET_FIELDS:
            rows.append(
                {
                    "label": _SET_FIELDS[field],
                    "kind": "set",
                    "added": new[:_MAX_LISTED],
                    "removed": old[:_MAX_LISTED],
                    "more_added": max(len(new) - _MAX_LISTED, 0),
                    "more_removed": max(len(old) - _MAX_LISTED, 0),
                    "link": field == "link",
                }
            )
        else:
            label = _SCALAR_FIELDS.get(field) or field.replace("_", " ").capitalize()
            rows.append(
                {
                    "label": label,
                    "kind": "change",
                    "old": _display(field, old[0]) if old else "",
                    "new": _display(field, new[-1]) if new else "",
                    "nowrap": field in ("start_date", "target_date"),
                }
            )
    return rows

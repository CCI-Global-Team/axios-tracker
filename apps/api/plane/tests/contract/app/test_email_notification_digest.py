# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: the work-item updates digest is only sent when it has something to show."""

from unittest import mock

import pytest

from plane.bgtasks import email_notification_task as task
from plane.db.models import Issue, Project

pytestmark = pytest.mark.contract


@pytest.fixture
def issue(workspace, create_user):
    project = Project.objects.create(name="Mobile", identifier="MOB", workspace=workspace, created_by=create_user)
    return Issue.objects.create(name="Giving page won't load", project=project, workspace=workspace)


@pytest.fixture
def outbox():
    redis = mock.Mock()
    redis.get.return_value = b"https://axios.example.test"
    with (
        mock.patch.object(task, "redis_instance", return_value=redis),
        mock.patch.object(task, "acquire_lock", return_value=True),
        mock.patch.object(task, "release_lock"),
        mock.patch.object(task, "get_email_configuration", return_value=("h", "u", "p", "25", "0", "0", "f@x")),
        mock.patch.object(task, "get_connection"),
        mock.patch.object(task, "EmailMultiAlternatives") as message,
    ):
        yield message


def activity(field, old, new):
    return {
        "issue_activity": {
            "field": field,
            "old_value": old,
            "new_value": new,
            "activity_time": "2026-11-19T14:05:00Z",
        }
    }


def send(issue, actor, *activities):
    task.send_email_notification(
        issue_id=str(issue.id),
        notification_data={str(actor.id): list(activities)},
        receiver_id=str(actor.id),
        email_notification_ids=["1"],
    )


def test_a_digest_with_nothing_to_show_is_not_sent(db, issue, create_user, outbox):
    send(issue, create_user, activity("reaction", None, "128077"), activity("estimate_points", None, None))
    outbox.assert_not_called()


def test_a_digest_with_a_change_is_sent_with_its_row(db, issue, create_user, outbox):
    send(issue, create_user, activity("target_date", "2026-11-20", "2026-11-24"))
    body = outbox.call_args.kwargs["body"]
    assert "- Due date: 20 Nov 2026 -> 24 Nov 2026" in body

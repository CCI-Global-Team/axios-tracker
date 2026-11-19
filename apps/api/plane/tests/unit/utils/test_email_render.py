# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import datetime

import pytest

from plane.utils.email_render import render_email

SITE = "https://axios.example.test"
ISSUE_URL = f"{SITE}/cci/projects/p1/issues/i1"
PREFS = f"{SITE}/cci/settings/account/notifications/"

# (template, context, the action link the reader needs, a phrase the text part must carry)
CASES = [
    ("emails/auth/magic_signin", {"code": "482913", "email": "a@example.test", "current_site": SITE}, None, "482913"),
    (
        "emails/user/email_change_code",
        {"code": "730154", "email": "a@example.test", "current_site": SITE},
        None,
        "730154",
    ),
    (
        "emails/auth/forgot_password",
        {
            "first_name": "Amaka",
            "forgot_password_url": f"{SITE}/reset?t=1",
            "email": "a@example.test",
            "current_site": SITE,
        },
        f"{SITE}/reset?t=1",
        "Hi Amaka",
    ),
    (
        "emails/invitations/workspace_invitation",
        {
            "email": "d@example.test",
            "first_name": "Tolu",
            "workspace_name": "CCI",
            "abs_url": f"{SITE}/inv?t=2",
            "current_site": SITE,
        },
        f"{SITE}/inv?t=2",
        "Join CCI on Axios",
    ),
    (
        "emails/invitations/project_invitation",
        {
            "email": "d@example.test",
            "first_name": "Tolu",
            "project_name": "CCI App",
            "invitation_url": f"{SITE}/p?t=3",
            "current_site": SITE,
        },
        f"{SITE}/p?t=3",
        "CCI App",
    ),
    (
        "emails/notifications/project_addition",
        {
            "project_name": "CCI App",
            "workspace_name": "CCI",
            "email": "d@example.test",
            "inviter_first_name": "Tolu",
            "project_url": f"{SITE}/cci/projects/p1/issues",
            "current_site": SITE,
        },
        f"{SITE}/cci/projects/p1/issues",
        "Tolu added you",
    ),
    (
        "emails/notifications/issue-assigned",
        {
            "assigner_name": "Tolu",
            "receiver": {"email": "c@example.test", "first_name": "Chidi"},
            "issue": {
                "identifier": "MOB-142",
                "name": "Giving page won't load",
                "state": "Triage",
                "priority": "high",
                "target_date": datetime.date(2026, 11, 24),
            },
            "project": "CCI App",
            "workspace": "cci",
            "issue_url": ISSUE_URL,
            "user_preference": PREFS,
            "current_site": SITE,
        },
        ISSUE_URL,
        "Giving page won't load",
    ),
    (
        "emails/notifications/issue-updates",
        {
            "data": [
                {
                    "actor_detail": {"avatar_url": "", "first_name": "Tolu", "last_name": "Bakare"},
                    "changes": {
                        "state": {"old_value": ["Triage"], "new_value": ["In Progress"]},
                        "labels": {"old_value": [], "new_value": ["mobile", "Ikeja"]},
                    },
                    "activity_time": "14:05 UTC",
                }
            ],
            "summary": "Updates were made to the issue by",
            "actors_involved": 1,
            "issue": {"issue_identifier": "MOB-142", "name": "Giving page won't load", "issue_url": ISSUE_URL},
            "receiver": {"email": "c@example.test"},
            "issue_url": ISSUE_URL,
            "project_url": f"{SITE}/cci/projects/p1/issues/",
            "workspace": "cci",
            "project": "CCI App",
            "user_preference": PREFS,
            "comments": [
                {
                    "actor_comments": {"new_value": ["<p>It&#x27;s failing on Ikeja &amp; Yaba</p>"]},
                    "actor_detail": {"avatar_url": "", "first_name": "Amaka", "last_name": "Obi"},
                }
            ],
            "entity_type": "issue",
            "current_site": SITE,
        },
        ISSUE_URL,
        "It's failing on Ikeja & Yaba",
    ),
    (
        "emails/user/user_activation",
        {"email": "a@example.test", "profile_url": f"{SITE}/profile", "current_site": SITE},
        f"{SITE}/profile",
        "active again",
    ),
    (
        "emails/user/user_deactivation",
        {"email": "a@example.test", "login_url": f"{SITE}/login", "current_site": SITE},
        f"{SITE}/login",
        "deactivated",
    ),
    ("emails/user/email_updated", {"email": "a@example.test", "current_site": SITE}, SITE, "a@example.test"),
    (
        "emails/notifications/webhook-deactivate",
        {
            "email": "t@example.test",
            "message": "Webhook failed 5 times",
            "webhook_url": f"{SITE}/cci/settings/webhooks/w1",
            "current_site": SITE,
        },
        f"{SITE}/cci/settings/webhooks/w1",
        "Webhook failed 5 times",
    ),
    ("emails/exports/analytics", {"current_site": SITE}, None, "CSV"),
    ("emails/test_email", {"current_site": SITE}, None, "Email delivery is working"),
    (
        "emails/invitations/invite_accepted",
        {"email": "d@example.test", "workspace_name": "CCI", "grants": ["Member of <CCI App>"], "current_site": SITE},
        None,
        "- Member of <CCI App>",
    ),
]


@pytest.mark.unit
@pytest.mark.parametrize("template, context, action_url, phrase", CASES, ids=[c[0].split("/")[-1] for c in CASES])
def test_every_email_renders_one_layout_and_a_readable_text_part(template, context, action_url, phrase):
    html, text = render_email(template, context)

    # One shared layout, branded, with at most one primary button.
    assert "Celebration Church International" in html
    assert "#07152f" in html
    assert html.count('class="ax-btn-link"') == (1 if action_url else 0)
    if action_url:
        assert f'href="{action_url}"' in html

    # The text part is written for people: no tags, no entities, and the link is there to click.
    assert phrase in text
    assert "<" not in text.replace("<CCI App>", "")
    assert "&#" not in text and "&amp;" not in text
    assert "\n\n\n" not in text
    if action_url:
        assert action_url in text


@pytest.mark.unit
def test_html_part_escapes_values_the_text_part_keeps_verbatim():
    html, text = render_email(
        "emails/invitations/invite_accepted",
        {
            "email": "d@example.test",
            "workspace_name": "CCI",
            "grants": ["Campus label owner: <Ikeja>"],
            "current_site": SITE,
        },
    )
    assert "&lt;Ikeja&gt;" in html and "<Ikeja>" not in html
    assert "Campus label owner: <Ikeja>" in text

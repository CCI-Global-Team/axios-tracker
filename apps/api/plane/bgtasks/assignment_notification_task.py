# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import logging

# Third party imports
from celery import shared_task

# Django imports
from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string

# Module imports
from plane.db.models import Issue, User, UserNotificationPreference
from plane.license.utils.instance_value import get_email_configuration
from plane.utils.email import generate_plain_text_from_html
from plane.utils.exception_logger import log_exception


@shared_task
def send_assignment_email(issue_id, assignee_id, actor_id):
    """CCI: tell someone they have been given a work item.

    Sent on its own rather than through `stack_email_notification`, for two reasons. The stacker
    groups a five-minute window per (person, work item) under one hardcoded heading, so an
    assignment arrives indistinguishable from a label edit someone else made. And it reads its
    base URL from a Redis key with a ten-minute expiry, so a worker that falls behind drops the
    mail silently with nothing recorded.

    Skipped for self-assignment: nobody needs telling what they just did.
    """
    try:
        if str(assignee_id) == str(actor_id):
            return

        assignee = User.objects.filter(pk=assignee_id, is_active=True, is_bot=False).first()
        if assignee is None or not assignee.email:
            return

        # A missing row means the account never went through the normal signup path. Treat it as
        # the model's own default rather than raising or silently skipping.
        preference = UserNotificationPreference.objects.filter(user_id=assignee_id).first()
        if preference is not None and not preference.assignment:
            return

        issue = Issue.objects.filter(pk=issue_id).select_related("project", "project__workspace", "state").first()
        actor = User.objects.filter(pk=actor_id).first()
        if issue is None or actor is None:
            return

        (
            EMAIL_HOST,
            EMAIL_HOST_USER,
            EMAIL_HOST_PASSWORD,
            EMAIL_PORT,
            EMAIL_USE_TLS,
            EMAIL_USE_SSL,
            EMAIL_FROM,
        ) = get_email_configuration()

        current_site = settings.APP_BASE_URL or settings.WEB_URL or ""
        workspace_slug = issue.project.workspace.slug
        identifier = f"{issue.project.identifier}-{issue.sequence_id}"

        context = {
            "assigner_name": actor.display_name or actor.first_name or actor.email,
            "receiver": {"email": assignee.email, "first_name": assignee.first_name},
            "issue": {
                "identifier": identifier,
                "name": issue.name,
                "state": issue.state.name if issue.state else None,
                "priority": issue.priority if issue.priority != "none" else None,
                "target_date": issue.target_date,
            },
            "project": issue.project.name,
            "workspace": workspace_slug,
            "issue_url": f"{current_site}/{workspace_slug}/projects/{issue.project.id}/issues/{issue.id}",
            "user_preference": f"{current_site}/{workspace_slug}/settings/account/notifications/",
            "current_site": current_site,
        }

        subject = f"You're assigned: {identifier} {issue.name}"
        html_content = render_to_string("emails/notifications/issue-assigned.html", context)
        text_content = generate_plain_text_from_html(html_content)

        connection = get_connection(
            host=EMAIL_HOST,
            port=int(EMAIL_PORT),
            username=EMAIL_HOST_USER,
            password=EMAIL_HOST_PASSWORD,
            use_tls=EMAIL_USE_TLS == "1",
            use_ssl=EMAIL_USE_SSL == "1",
        )
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=EMAIL_FROM,
            to=[assignee.email],
            connection=connection,
        )
        msg.attach_alternative(html_content, "text/html")
        msg.send()
        logging.getLogger("plane.worker").info(f"Assignment email sent for {identifier}")
        return
    except Exception as e:
        log_exception(e)
        return

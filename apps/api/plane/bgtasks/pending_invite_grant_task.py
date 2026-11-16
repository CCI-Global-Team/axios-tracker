# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from html import escape

from celery import shared_task
from django.core.mail import EmailMultiAlternatives, get_connection

from plane.db.models import User
from plane.license.utils.instance_value import get_email_configuration
from plane.utils.exception_logger import log_exception


# CCI: one summary per accepted invite and inviter, independent of the deleted invitation row.
@shared_task
def pending_invite_grants_notification(inviter_id, email, workspace_name, grants):
    try:
        inviter = User.objects.filter(pk=inviter_id).first()
        if inviter is None:
            return
        host, username, password, port, use_tls, use_ssl, from_email = get_email_configuration()
        connection = get_connection(
            host=host,
            port=int(port),
            username=username,
            password=password,
            use_tls=use_tls == "1",
            use_ssl=use_ssl == "1",
        )
        intro = f"{email} accepted your invitation to {workspace_name}. Granted:"
        body = intro + "\n\n" + "\n".join(f"- {grant}" for grant in grants)
        message = EmailMultiAlternatives(
            subject=f"Invitation accepted — {workspace_name}",
            body=body,
            from_email=from_email,
            to=[inviter.email],
            connection=connection,
        )
        items = "".join(f"<li>{escape(grant)}</li>" for grant in grants)
        message.attach_alternative(f"<p>{escape(intro)}</p><ul>{items}</ul>", "text/html")
        message.send()
    except Exception as exc:
        log_exception(exc)

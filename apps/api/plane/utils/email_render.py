# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
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

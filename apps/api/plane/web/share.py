# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: the public page behind a work item share link (GAM-401).

The web app is a static SPA, so chat apps (WhatsApp, Discord, Slack) only ever see its generic card.
A share link is served here instead: a tiny server-rendered page whose Open Graph tags describe the
one work item the link was made for, which then sends a human on to the real (login-gated) item.
Every value is escaped — work item names are user input.
"""

# Python imports
import re
from urllib.parse import quote

# Django imports
from django.http import HttpResponse
from django.utils.html import escape
from django.views.decorators.http import require_safe

# Module imports
from plane.db.models import Issue, WorkItemPublicLink
from plane.utils.public_links import OG_IMAGE_PATH, app_origin, share_url

SITE_NAME = "Axios"
GENERIC_DESCRIPTION = "CCI's internal tool for tracking work items, cycles, and product roadmaps."
DESCRIPTION_LIMIT = 200
CACHE_SECONDS = 300


def _excerpt(text):
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) <= DESCRIPTION_LIMIT:
        return text
    return text[:DESCRIPTION_LIMIT].rstrip() + "…"


def _meta(title, description, url, image):
    tags = [
        ("name", "description", description),
        ("name", "robots", "noindex"),
        ("property", "og:type", "website"),
        ("property", "og:site_name", SITE_NAME),
        ("property", "og:title", title),
        ("property", "og:description", description),
        ("property", "og:url", url),
        ("property", "og:image", image),
        ("property", "og:image:width", "1200"),
        ("property", "og:image:height", "630"),
        ("property", "og:image:alt", "Axios - CCI's engineering tracker"),
        ("name", "twitter:card", "summary_large_image"),
        ("name", "twitter:title", title),
        ("name", "twitter:description", description),
        ("name", "twitter:image", image),
    ]
    return "\n".join(f'    <meta {attr}="{escape(key)}" content="{escape(value)}">' for attr, key, value in tags)


def _page(title, description, url, image, head_extra="", body=""):
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{escape(title)}</title>
{_meta(title, description, url, image)}
{head_extra}
    <style>
      body {{ font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 48px 16px;
        background: #f7f7f8; color: #1f2328; }}
      main {{ max-width: 560px; margin: 0 auto; }}
      .key {{ color: #6b7280; font-size: 14px; }}
      h1 {{ font-size: 22px; margin: 4px 0 8px; overflow-wrap: anywhere; }}
      a {{ color: #0b63ce; display: inline-block; min-height: 44px; line-height: 44px; }}
      @media (prefers-color-scheme: dark) {{ body {{ background: #16181d; color: #e6e7ea; }} a {{ color: #6aa8ff; }} }}
    </style>
  </head>
  <body>
    <main>
{body}
    </main>
  </body>
</html>
"""


def _respond(html, status):
    response = HttpResponse(html, status=status, content_type="text/html; charset=utf-8")
    response["Cache-Control"] = f"public, max-age={CACHE_SECONDS}"
    response["X-Robots-Tag"] = "noindex"
    return response


def _live_issue(token):
    link = (
        WorkItemPublicLink.objects.filter(token=token, revoked_at__isnull=True)
        .only("issue_id", "include_description")
        .first()
    )
    if link is None:
        return None, None
    # issue_objects leaves out deleted, archived, draft and triage items, and items of archived projects.
    issue = (
        Issue.issue_objects.filter(pk=link.issue_id, project__deleted_at__isnull=True)
        .select_related("project", "state", "workspace")
        .first()
    )
    return link, issue


@require_safe
def share_page(request, token):
    origin = app_origin(request)
    image = f"{origin}{OG_IMAGE_PATH}"
    link, issue = _live_issue(token)

    if issue is None:
        body = (
            "      <h1>Axios</h1>\n"
            "      <p>This link has expired or does not exist.</p>\n"
            '      <a href="/">Open Axios</a>'
        )
        return _respond(_page(SITE_NAME, GENERIC_DESCRIPTION, f"{origin}/", image, body=body), status=404)

    key = f"{issue.project.identifier}-{issue.sequence_id}"
    title = f"{key} · {issue.name}"
    parts = [part for part in (issue.state.name if issue.state else "", issue.project.name) if part]
    description = " · ".join(parts)
    if link.include_description:
        excerpt = _excerpt(issue.description_stripped)
        if excerpt:
            description = f"{description} — {excerpt}"
    target = f"/{quote(issue.workspace.slug)}/browse/{quote(key)}/"
    url = share_url(request, token)

    head_extra = (
        f'    <meta http-equiv="refresh" content="0; url={escape(target)}">\n'
        f'    <link rel="canonical" href="{escape(url)}">'
    )
    state_line = f"      <p>{escape(issue.state.name)}</p>\n" if issue.state else ""
    body = (
        f'      <div class="key">{escape(key)}</div>\n'
        f"      <h1>{escape(issue.name)}</h1>\n"
        f"{state_line}"
        f'      <a href="{escape(target)}">Open in Axios</a>'
    )
    return _respond(_page(title, description, url, image, head_extra=head_extra, body=body), status=200)

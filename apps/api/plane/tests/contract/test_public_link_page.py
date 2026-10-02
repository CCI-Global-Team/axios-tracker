# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: contract tests for the public share link page /s/<token> (GAM-401)."""

import html
import re

import pytest
from django.test import Client
from django.utils import timezone

from plane.db.models import Issue, WorkItemPublicLink
from plane.tests.contract.release_helpers import build_project, make_issue

ORIGIN = "https://axios.example.test"
IMAGE = f"{ORIGIN}/og/axios-card.png"


@pytest.fixture(autouse=True)
def app_origin(settings):
    settings.APP_BASE_URL = ORIGIN
    settings.WEB_URL = ORIGIN


@pytest.fixture
def anonymous():
    return Client()


@pytest.fixture
def project_and_states(db, workspace, create_user):
    return build_project(workspace, create_user, identifier="GAM")


@pytest.fixture
def issue(project_and_states):
    project, states = project_and_states
    issue = make_issue(project, states["In Progress"], "Ship the share links")
    Issue.objects.filter(pk=issue.pk).update(description_stripped="  First line.\n\n  Second   line with secrets  ")
    issue.refresh_from_db()
    return issue


def make_link(issue, **extra):
    return WorkItemPublicLink.objects.create(issue=issue, project=issue.project, **extra)


def meta(body, key):
    """The content of the (single) meta tag whose name/property is ``key``, unescaped."""
    found = re.findall(rf'<meta (?:name|property)="{re.escape(key)}" content="([^"]*)">', body)
    assert len(found) == 1, (key, found)
    return html.unescape(found[0])


@pytest.mark.contract
class TestPublicLinkPage:
    @pytest.mark.django_db
    def test_live_link_renders_item_tags(self, anonymous, issue, workspace):
        link = make_link(issue)
        response = anonymous.get(f"/s/{link.token}")
        body = response.content.decode()

        assert response.status_code == 200
        assert response["Content-Type"] == "text/html; charset=utf-8"
        assert response["Cache-Control"] == "public, max-age=300"
        key = f"GAM-{issue.sequence_id}"
        assert f"<title>{key} · Ship the share links</title>" in body
        assert meta(body, "og:title") == f"{key} · Ship the share links"
        assert meta(body, "twitter:title") == f"{key} · Ship the share links"
        assert meta(body, "og:description") == "In Progress · Project GAM"
        assert meta(body, "og:url") == f"{ORIGIN}/s/{link.token}"
        assert meta(body, "og:type") == "website"
        assert meta(body, "og:site_name") == "Axios"
        assert meta(body, "og:image") == IMAGE
        assert meta(body, "twitter:image") == IMAGE
        assert meta(body, "og:image:width") == "1200"
        assert meta(body, "og:image:height") == "630"
        assert meta(body, "twitter:card") == "summary_large_image"
        assert meta(body, "robots") == "noindex"
        target = f"/{workspace.slug}/browse/{key}/"
        assert f'<script>location.replace("{target}")</script>' in body
        assert 'http-equiv="refresh"' not in body
        assert f'<a href="{target}">Open in Axios</a>' in body
        # without include_description nothing of the description leaks
        assert "secrets" not in body

    @pytest.mark.django_db
    def test_include_description_adds_collapsed_excerpt(self, anonymous, issue):
        link = make_link(issue, include_description=True)
        body = anonymous.get(f"/s/{link.token}").content.decode()
        assert meta(body, "og:description") == "In Progress · Project GAM — First line. Second line with secrets"
        assert meta(body, "twitter:description") == meta(body, "og:description")

    @pytest.mark.django_db
    def test_long_description_is_cut_at_200_with_ellipsis(self, anonymous, issue):
        Issue.objects.filter(pk=issue.pk).update(description_stripped="word " * 100)
        link = make_link(issue, include_description=True)
        description = meta(anonymous.get(f"/s/{link.token}").content.decode(), "og:description")
        excerpt = description.split(" — ", 1)[1]
        assert excerpt.endswith("…")
        assert len(excerpt) <= 201

    @pytest.mark.django_db
    def test_html_in_the_name_is_escaped(self, anonymous, issue):
        Issue.objects.filter(pk=issue.pk).update(name='"><script>alert(1)</script><meta property="og:title" content="x')
        link = make_link(issue)
        body = anonymous.get(f"/s/{link.token}").content.decode()

        # The only script is the page's own redirect; the injected one is escaped.
        assert "<script>alert(1)" not in body
        assert body.count("<script>") == 1
        assert "&lt;script&gt;alert(1)&lt;/script&gt;" in body
        assert meta(body, "og:title").endswith('"><script>alert(1)</script><meta property="og:title" content="x')

    @pytest.mark.django_db
    def test_revoked_link_is_generic_404(self, anonymous, issue):
        link = make_link(issue, revoked_at=timezone.now())
        response = anonymous.get(f"/s/{link.token}")
        body = response.content.decode()

        assert response.status_code == 404
        assert response["Cache-Control"] == "public, max-age=300"
        assert "<title>Axios</title>" in body
        assert meta(body, "og:title") == "Axios"
        assert meta(body, "og:image") == IMAGE
        assert "Ship the share links" not in body
        assert "GAM-" not in body

    @pytest.mark.django_db
    def test_unknown_token_is_generic_404(self, anonymous, db):
        response = anonymous.get("/s/not-a-real-token")
        assert response.status_code == 404
        assert meta(response.content.decode(), "og:title") == "Axios"

    @pytest.mark.django_db
    def test_archived_or_deleted_item_is_generic_404(self, anonymous, issue):
        link = make_link(issue)
        Issue.objects.filter(pk=issue.pk).update(archived_at=timezone.now().date())
        assert anonymous.get(f"/s/{link.token}").status_code == 404

        Issue.objects.filter(pk=issue.pk).update(archived_at=None, deleted_at=timezone.now())
        response = anonymous.get(f"/s/{link.token}")
        assert response.status_code == 404
        assert "Ship the share links" not in response.content.decode()

    @pytest.mark.django_db
    def test_get_writes_nothing(self, anonymous, issue, django_assert_max_num_queries):
        link = make_link(issue)
        with django_assert_max_num_queries(5) as captured:
            anonymous.get(f"/s/{link.token}")
        assert all(q["sql"].lstrip().upper().startswith("SELECT") for q in captured.captured_queries)

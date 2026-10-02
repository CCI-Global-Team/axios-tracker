# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import secrets

# Django imports
from django.db import models

# Module imports
from .project import ProjectBaseModel


def generate_public_link_token():
    # 16 random bytes -> 22 url-safe characters. The token is the whole secret: it is unguessable,
    # and revoking the row kills the link, which is all "signed" has to mean for a share link.
    return secrets.token_urlsafe(16)


class WorkItemPublicLink(ProjectBaseModel):
    """CCI: an opt-in share link for one work item (GAM-401).

    Only /s/<token> renders a rich chat preview (key, title, state, and optionally the start of the
    description). Everything else in Axios stays behind login.
    """

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="public_links")
    token = models.CharField(max_length=32, unique=True, default=generate_public_link_token)
    include_description = models.BooleanField(default=False)
    revoked_at = models.DateTimeField(null=True)

    class Meta:
        verbose_name = "Work Item Public Link"
        verbose_name_plural = "Work Item Public Links"
        db_table = "work_item_public_links"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.issue_id} {self.token[:4]}…"

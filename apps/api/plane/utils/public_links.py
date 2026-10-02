# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: share links for single work items (GAM-401)."""

# Module imports
from plane.utils.host import base_host

SHARE_PATH = "/s/"
OG_IMAGE_PATH = "/og/axios-card.png"


def app_origin(request):
    """The public origin of the web app, without a trailing slash (APP_BASE_URL, else WEB_URL)."""
    return base_host(request=request, is_app=True).rstrip("/")


def share_url(request, token):
    return f"{app_origin(request)}{SHARE_PATH}{token}"


def serialize_public_link(request, link):
    return {
        "id": str(link.id),
        "token": link.token,
        "url": share_url(request, link.token),
        "include_description": link.include_description,
        "created_at": link.created_at,
        "created_by": str(link.created_by_id) if link.created_by_id else None,
        "revoked_at": link.revoked_at,
    }

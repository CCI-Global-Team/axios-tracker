# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    ReleaseDetailAPIEndpoint,
    ReleaseIssueDetailAPIEndpoint,
    ReleaseIssueListCreateAPIEndpoint,
    ReleaseListCreateAPIEndpoint,
    ReleaseShipAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/releases/ship/",
        ReleaseShipAPIEndpoint.as_view(http_method_names=["post"]),
        name="releases-ship",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/",
        ReleaseListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="releases",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:pk>/",
        ReleaseDetailAPIEndpoint.as_view(http_method_names=["get", "patch"]),
        name="releases-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:release_id>/issues/",
        ReleaseIssueListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="release-issues",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:release_id>/issues/<uuid:issue_id>/",
        ReleaseIssueDetailAPIEndpoint.as_view(http_method_names=["delete"]),
        name="release-issues-detail",
    ),
]

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    IssueReleaseEndpoint,
    ReleaseActionEndpoint,
    ReleaseCandidateEndpoint,
    ReleaseEndpoint,
    ReleaseIssueEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/",
        ReleaseEndpoint.as_view(http_method_names=["get", "post"]),
        name="project-releases",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:pk>/",
        ReleaseEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="project-release-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:release_id>/issues/",
        ReleaseIssueEndpoint.as_view(http_method_names=["get", "post"]),
        name="project-release-issues",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:release_id>/issues/<uuid:issue_id>/",
        ReleaseIssueEndpoint.as_view(http_method_names=["delete"]),
        name="project-release-issue-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:release_id>/<str:action>/",
        ReleaseActionEndpoint.as_view(http_method_names=["post"]),
        name="project-release-action",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/release-candidates/",
        ReleaseCandidateEndpoint.as_view(http_method_names=["get"]),
        name="project-release-candidates",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/release/",
        IssueReleaseEndpoint.as_view(http_method_names=["get"]),
        name="issue-release",
    ),
]

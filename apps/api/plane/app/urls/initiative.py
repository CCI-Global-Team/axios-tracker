# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views.initiative import InitiativeEndpoint, InitiativeIssueEndpoint, InitiativeModuleEndpoint

urlpatterns = [
    path(
        "workspaces/<str:slug>/initiatives/",
        InitiativeEndpoint.as_view(http_method_names=["get", "post"]),
        name="workspace-initiatives",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:pk>/",
        InitiativeEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="workspace-initiative-detail",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:pk>/modules/",
        InitiativeModuleEndpoint.as_view(http_method_names=["post"]),
        name="workspace-initiative-modules",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:pk>/modules/<uuid:module_id>/",
        InitiativeModuleEndpoint.as_view(http_method_names=["delete"]),
        name="workspace-initiative-module-detail",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:pk>/issues/",
        InitiativeIssueEndpoint.as_view(http_method_names=["get"]),
        name="workspace-initiative-issues",
    ),
]

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CCI: project members may create labels; renaming and deleting stay admin-only."""

import pytest
from rest_framework import status

from plane.db.models import Label, ProjectMember, User, WorkspaceMember
from plane.tests.contract.release_helpers import build_project


def labels_url(workspace, project):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-labels/"


def as_project_role(api_client, workspace, project, role):
    """A separate user who is an ordinary workspace member with ``role`` on the project. The fixture
    user owns the workspace, and workspace owners pass every project permission check."""
    user = User.objects.create(email=f"role{role}@example.com", username=f"role{role}")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15 if role >= 15 else 5)
    ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=role, is_active=True)
    api_client.force_authenticate(user=user)
    return api_client


@pytest.mark.contract
class TestLabelPermissions:
    @pytest.mark.django_db
    def test_member_can_create_a_label(self, session_client, workspace, create_user):
        project, _ = build_project(workspace, create_user, identifier="LBM")
        session_client = as_project_role(session_client, workspace, project, 15)
        response = session_client.post(labels_url(workspace, project), {"name": "design", "color": "#f59e0b"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert Label.objects.filter(project=project, name="design").exists()

    @pytest.mark.django_db
    def test_member_cannot_delete_a_label(self, session_client, workspace, create_user):
        project, _ = build_project(workspace, create_user, identifier="LBD")
        session_client = as_project_role(session_client, workspace, project, 15)
        label = Label.objects.create(project=project, workspace=workspace, name="qa", color="#ef4444")
        response = session_client.delete(f"{labels_url(workspace, project)}{label.id}/")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert Label.objects.filter(pk=label.pk).exists()

    @pytest.mark.django_db
    def test_guest_cannot_create_a_label(self, session_client, workspace, create_user):
        project, _ = build_project(workspace, create_user, identifier="LBG")
        session_client = as_project_role(session_client, workspace, project, 5)
        response = session_client.post(labels_url(workspace, project), {"name": "design"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not Label.objects.filter(project=project).exists()

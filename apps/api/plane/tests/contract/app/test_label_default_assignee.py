# ruff: noqa: F811
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.app.serializers.issue import LabelSerializer
from plane.db.models import Label, ProjectMember, User
from plane.tests.contract.api.test_intake_external import intake_project  # noqa: F401

pytestmark = pytest.mark.contract


@pytest.mark.parametrize("membership", ["member", "non-member", "guest", "inactive"])
def test_label_owner_patch(session_client, create_user, workspace, intake_project, membership):
    # CCI: copy the app contract authentication pattern; intake_project makes this user an admin.
    session_client.force_authenticate(user=create_user)
    label = Label.objects.create(project=intake_project, workspace=workspace, name="Ikeja")
    owner = User.objects.create(email="label-owner@example.test", username="label-owner")
    if membership != "non-member":
        ProjectMember.objects.create(
            project=intake_project,
            member=owner,
            role=5 if membership == "guest" else 15,
            is_active=membership != "inactive",
        )
    url = f"/api/workspaces/{workspace.slug}/projects/{intake_project.id}/issue-labels/{label.id}/"
    response = session_client.patch(url, {"default_assignee": str(owner.id)}, format="json")
    label.refresh_from_db()
    if membership != "member":
        assert response.status_code == 400
        assert response.data["default_assignee"] == ["DEFAULT_ASSIGNEE_NOT_A_PROJECT_MEMBER"]
        assert label.default_assignee_id is None
        return
    assert response.status_code == 200
    assert str(response.data["default_assignee"]) == str(owner.id)
    assert label.default_assignee_id == owner.id
    response = session_client.patch(url, {"default_assignee": None}, format="json")
    assert response.status_code == 200
    assert response.data["default_assignee"] is None
    label.refresh_from_db()
    assert label.default_assignee_id is None


def test_label_owner_validation_uses_instance_project(workspace, intake_project, create_user):
    label = Label.objects.create(project=intake_project, workspace=workspace, name="Ikeja")
    serializer = LabelSerializer(instance=label, data={"default_assignee": str(create_user.id)}, partial=True)
    assert serializer.is_valid(), serializer.errors
    assert serializer.save().default_assignee_id == create_user.id

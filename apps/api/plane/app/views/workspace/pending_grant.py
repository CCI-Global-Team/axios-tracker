# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from plane.app.permissions import WorkSpaceAdminPermission, WorkspaceEntityPermission
from plane.app.views.base import BaseAPIView
from plane.app.views.workspace.invite import build_workspace_invitation, send_workspace_invitation
from plane.db.models import Issue, Label, PendingInviteGrant, Project, ProjectMember, Workspace, WorkspaceMember


# CCI: explicit serializer keeps UUID/email validation and the public response shape stable.
class PendingGrantSerializer(serializers.ModelSerializer):
    project_id = serializers.UUIDField()
    invite_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = PendingInviteGrant
        fields = ("id", "email", "kind", "project_id", "target_id", "invite_id", "created_by", "created_at")
        read_only_fields = ("id", "invite_id", "created_by", "created_at")

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, attrs):
        project = Project.objects.filter(pk=attrs["project_id"], workspace__slug=self.context["slug"]).first()
        if project is None:
            raise serializers.ValidationError({"project_id": "Project does not belong to this workspace."})
        target = attrs.get("target_id")
        model = {"label_owner": Label, "issue_assignee": Issue}.get(attrs["kind"])
        if model:
            if target is None or not model.objects.filter(pk=target, project=project).exists():
                raise serializers.ValidationError({"target_id": "Target must belong to this project."})
        elif target is not None:
            raise serializers.ValidationError({"target_id": "This kind does not accept a target."})
        if WorkspaceMember.objects.filter(
            workspace_id=project.workspace_id, member__email__iexact=attrs["email"], is_active=True
        ).exists():
            raise serializers.ValidationError({"email": "This email is already an active workspace member."})
        return attrs


class PendingInviteGrantEndpoint(BaseAPIView):
    # CCI: DELETE also permits project admins; POST additionally enforces workspace role 20.
    permission_classes = [WorkspaceEntityPermission]

    def get_permissions(self):
        if self.request.method == "DELETE":
            return [IsAuthenticated()]
        if self.request.method == "POST":
            return [WorkSpaceAdminPermission()]
        return super().get_permissions()

    def get(self, request, slug):
        if not WorkspaceMember.objects.filter(
            workspace__slug=slug, member=request.user, role__gte=15, is_active=True
        ).exists():
            raise PermissionDenied()
        query = serializers.UUIDField().run_validation(request.query_params.get("project_id"))
        # CCI: invitee emails are only for people who can see the project.
        if not (
            WorkspaceMember.objects.filter(workspace__slug=slug, member=request.user, role=20, is_active=True).exists()
            or ProjectMember.objects.filter(
                project_id=query, member=request.user, is_active=True, role__gte=15
            ).exists()
        ):
            raise PermissionDenied()
        grants = PendingInviteGrant.objects.filter(
            workspace__slug=slug,
            project_id=query,
            project__deleted_at__isnull=True,
            invite__accepted=False,
            invite__deleted_at__isnull=True,
        )
        return Response(PendingGrantSerializer(grants, many=True).data)

    def post(self, request, slug):
        if not WorkspaceMember.objects.filter(
            workspace__slug=slug, member=request.user, role=20, is_active=True
        ).exists():
            raise PermissionDenied()
        serializer = PendingGrantSerializer(data=request.data, context={"slug": slug})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            # CCI: serialize invite reuse and replacement, including when no grant exists yet.
            workspace = Workspace.objects.select_for_update().get(slug=slug)
            Project.objects.select_for_update().get(pk=data["project_id"], workspace=workspace)
            # CCI: a declined invitation cannot be answered again; replace it with a fresh one.
            declined = workspace.workspace_member_invite.filter(
                email__iexact=data["email"], accepted=False, responded_at__isnull=False
            )
            for stale in declined:
                stale.pending_grants.all().delete()
                stale.delete()
            invite = workspace.workspace_member_invite.filter(
                email__iexact=data["email"], accepted=False, responded_at__isnull=True
            ).first()
            if invite is not None and invite.role < 15:
                # CCI: the grant makes them a project member, which a workspace guest cannot be.
                invite.role = 15
                invite.save(update_fields=["role"], disable_auto_set_user=True)
            if invite is None:
                invite = build_workspace_invitation(workspace, {"email": data["email"], "role": 15}, request.user)
                invite.save(disable_auto_set_user=True)
                transaction.on_commit(lambda: send_workspace_invitation(request, invite))
            grants = PendingInviteGrant.objects.filter(
                project_id=data["project_id"],
                kind=data["kind"],
                target_id=data.get("target_id"),
                invite__accepted=False,
                invite__deleted_at__isnull=True,
            )
            if data["kind"] in ("label_owner", "project_default_assignee", "project_lead"):
                grants.delete()
            else:
                existing = grants.filter(email=data["email"]).first()
                if existing:
                    return Response(PendingGrantSerializer(existing).data, status=status.HTTP_200_OK)
            grant = PendingInviteGrant(
                workspace=workspace,
                invite=invite,
                created_by=request.user,
                **data,
            )
            grant.save(disable_auto_set_user=True)
        return Response(PendingGrantSerializer(grant).data, status=status.HTTP_201_CREATED)

    def delete(self, request, slug, pk):
        grant = get_object_or_404(PendingInviteGrant, pk=pk, workspace__slug=slug)
        workspace_admin = WorkspaceMember.objects.filter(
            workspace_id=grant.workspace_id, member=request.user, role=20, is_active=True
        ).exists()
        project_admin = ProjectMember.objects.filter(
            project_id=grant.project_id, member=request.user, role=20, is_active=True
        ).exists()
        if not workspace_admin and not project_admin:
            raise PermissionDenied()
        # CCI: cancel only the grant; the workspace invitation remains usable.
        PendingInviteGrant.objects.filter(pk=grant.pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.initiative import InitiativeModulesSerializer, InitiativeSerializer
from plane.db.models import Initiative, InitiativeModule, Workspace, WorkspaceMember
from plane.utils.grouper import issue_queryset_grouper
from plane.utils.initiatives import initiatives_with_progress, visible_issues, visible_modules
from plane.utils.issue_list import annotate_issue_list, serialize_issue_list
from .base import BaseAPIView

ROLES = [ROLE.ADMIN, ROLE.MEMBER]


def initiative_response(slug, user, pk, response_status=status.HTTP_200_OK):
    initiative = get_object_or_404(initiatives_with_progress(slug, user), pk=pk)
    return Response(InitiativeSerializer(initiative).data, status=response_status)


class InitiativeEndpoint(BaseAPIView):
    @allow_permission(ROLES, level="WORKSPACE")
    def get(self, request, slug, pk=None):
        if pk:
            return initiative_response(slug, request.user, pk)
        return Response(InitiativeSerializer(initiatives_with_progress(slug, request.user), many=True).data)

    @allow_permission(ROLES, level="WORKSPACE")
    def post(self, request, slug):
        workspace = get_object_or_404(Workspace, slug=slug)
        serializer = InitiativeSerializer(data=request.data, context={"workspace_id": workspace.id})
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                initiative = serializer.save(workspace=workspace, created_by=request.user)
        except IntegrityError:
            return Response({"name": ["An initiative with this name already exists."]}, status=400)
        return initiative_response(slug, request.user, initiative.pk, status.HTTP_201_CREATED)

    @allow_permission(ROLES, level="WORKSPACE")
    def patch(self, request, slug, pk):
        initiative = get_object_or_404(Initiative, workspace__slug=slug, pk=pk)
        serializer = InitiativeSerializer(
            initiative, data=request.data, partial=True, context={"workspace_id": initiative.workspace_id}
        )
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError:
            return Response({"name": ["An initiative with this name already exists."]}, status=400)
        return initiative_response(slug, request.user, pk)

    @allow_permission(ROLES, level="WORKSPACE")
    def delete(self, request, slug, pk):
        initiative = get_object_or_404(Initiative, workspace__slug=slug, pk=pk)
        if (
            initiative.created_by_id != request.user.id
            and not WorkspaceMember.objects.filter(
                workspace__slug=slug, member=request.user, is_active=True, role=ROLE.ADMIN.value
            ).exists()
        ):
            return Response({"error": "Only the creator or a workspace admin can delete this initiative."}, status=403)
        with transaction.atomic():
            initiative.initiative_modules.all().delete()
            initiative.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InitiativeModuleEndpoint(BaseAPIView):
    @allow_permission(ROLES, level="WORKSPACE")
    def post(self, request, slug, pk):
        serializer = InitiativeModulesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        module_ids = set(serializer.validated_data["module_ids"])
        with transaction.atomic():
            initiative = get_object_or_404(Initiative.objects.select_for_update(), workspace__slug=slug, pk=pk)
            allowed_ids = set(
                visible_modules(slug, request.user).filter(pk__in=module_ids).values_list("id", flat=True)
            )
            if allowed_ids != module_ids:
                return Response(
                    {"module_ids": ["Every module must belong to a project you can access in this workspace."]},
                    status=400,
                )
            for module_id in allowed_ids:
                InitiativeModule.objects.get_or_create(
                    initiative=initiative,
                    module_id=module_id,
                    defaults={"workspace_id": initiative.workspace_id, "created_by": request.user},
                )
        return initiative_response(slug, request.user, pk)

    @allow_permission(ROLES, level="WORKSPACE")
    def delete(self, request, slug, pk, module_id):
        initiative = get_object_or_404(Initiative, workspace__slug=slug, pk=pk)
        get_object_or_404(visible_modules(slug, request.user), pk=module_id)
        InitiativeModule.objects.filter(initiative=initiative, module_id=module_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InitiativeIssueEndpoint(BaseAPIView):
    @allow_permission(ROLES, level="WORKSPACE")
    def get(self, request, slug, pk):
        get_object_or_404(Initiative, workspace__slug=slug, pk=pk)
        issues = visible_issues(slug, request.user, pk).distinct()
        issues = issue_queryset_grouper(queryset=annotate_issue_list(issues), group_by=False, sub_group_by=False)
        return Response(serialize_issue_list(issues, request.user))

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path
from plane.web.views import robots_txt, health_check
from plane.web.share import share_page

urlpatterns = [
    path("robots.txt", robots_txt),
    # CCI: public work item share links (GAM-401)
    path("s/<str:token>", share_page, name="work-item-share"),
    path("s/<str:token>/", share_page),
    path("", health_check),
]

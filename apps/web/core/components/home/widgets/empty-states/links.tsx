/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { Link2 } from "lucide-react";

// CCI: one quiet line, not a large illustration; "Add quick link" sits in the section header.
export function LinksEmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex w-full items-center gap-2 rounded-lg border border-dashed border-subtle px-4 py-3 text-13 text-tertiary">
      <Link2 className="size-4 flex-shrink-0" aria-hidden />
      {t("workspace_empty_state.home_widget_quick_links.title")}
    </div>
  );
}

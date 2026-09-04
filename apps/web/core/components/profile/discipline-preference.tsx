"use client";

import { observer } from "mobx-react";
import useSWR from "swr";
// components
import { SettingsControlItem } from "@/components/settings/control-item";
// hooks
import { useUser, useUserSettings } from "@/hooks/store/user";
// services
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

/**
 * CCI: your own disciplines, read only.
 *
 * Read only because a discipline is an assessment used to decide who gets offered which work, not
 * a self-description - so an admin sets it. But until now there was nowhere at all for a person to
 * SEE theirs, which made "check yours is right" impossible rather than merely awkward. Hence a
 * plain row here, with the route to getting it changed spelled out.
 */
export const DisciplinePreference = observer(function DisciplinePreference() {
  const { data: currentUser } = useUser();
  const { data: currentUserSettings } = useUserSettings();
  const workspaceSlug =
    currentUserSettings?.workspace?.last_workspace_slug || currentUserSettings?.workspace?.fallback_workspace_slug;

  const { data, isLoading } = useSWR(
    workspaceSlug ? `WORKSPACE_MEMBER_DISCIPLINES_${workspaceSlug}` : null,
    workspaceSlug ? () => workspaceService.fetchMemberDisciplines(workspaceSlug) : null,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  const mine = data?.members?.find((m) => m.member_id === currentUser?.id);
  const labelFor = (slug: string) => data?.choices?.find((c) => c.value === slug)?.label ?? slug;
  const disciplines = mine?.disciplines ?? [];

  return (
    <SettingsControlItem
      title="Your discipline"
      description="What you work on. Set by an admin — if this is wrong, ask them to change it."
      control={
        <div className="flex max-w-64 flex-wrap justify-end gap-1">
          {isLoading && !data ? (
            <span className="text-tertiary">…</span>
          ) : disciplines.length === 0 ? (
            // Distinguishes "nobody has set one" from "loading" — the first is a thing to chase.
            <span className="text-tertiary">Not set</span>
          ) : (
            disciplines.map((slug) => (
              <span
                key={slug}
                className="text-xs rounded border border-subtle bg-surface-2 px-2 py-0.5 whitespace-nowrap text-secondary"
              >
                {labelFor(slug)}
              </span>
            ))
          )}
        </div>
      }
    />
  );
});

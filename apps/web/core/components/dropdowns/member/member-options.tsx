/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import type { Placement } from "@popperjs/core";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
import useSWR from "swr";
import { Combobox } from "@headlessui/react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Ban } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { CheckIcon, SearchIcon } from "@plane/propel/icons";
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import type { IUserLite, TMemberAvailability } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn, getMemberName, memberMatchesSearch, sortByCurrentUserThenSelected } from "@plane/utils";
// hooks
import { MemberHoverCard } from "@/components/dropdowns/member/member-hover-card";
import { useMember } from "@/hooks/store/use-member";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { usePlatformOS } from "@/hooks/use-platform-os";
// lib
import { formatDeclaredHoursShort, weekStartFor } from "@/lib/availability-week";
// local imports
import { MemberInvite } from "./member-invite";
import { MemberPickerRow } from "./member-picker-row";
import type { TPendingGrantTarget } from "@/services/pending-grant.service";
// services
import { WorkspaceService } from "@/services/workspace.service";

const memberOptionsWorkspaceService = new WorkspaceService();

interface Props {
  className?: string;
  getUserDetails: (userId: string) => IUserLite | undefined;
  isOpen: boolean;
  memberIds?: string[];
  /** CCI: single-select pickers can offer a "no one" row with this label; it chooses null. */
  clearLabel?: string;
  /** CCI: picks a person from outside the Combobox options (added to the project, or invited). */
  onSelectMember?: (userId: string) => void;
  /** CCI: when set, workspace members outside this project can be added from the search. */
  projectId?: string;
  /** CCI: the field this picker sets, held for someone invited from it until they accept. */
  pendingGrant?: TPendingGrantTarget;
  /** CCI: called once an invitation with a pending role has been sent. */
  onInvited?: () => void;
  onDropdownOpen?: () => void;
  optionsClassName?: string;
  placement: Placement | undefined;
  referenceElement: HTMLButtonElement | null;
  value?: string[] | string | null;
}

export const MemberOptions = observer(function MemberOptions(props: Props) {
  const {
    getUserDetails,
    isOpen,
    memberIds,
    onDropdownOpen,
    optionsClassName = "",
    placement,
    referenceElement,
    value,
    clearLabel,
    onSelectMember,
    projectId,
    pendingGrant,
    onInvited,
  } = props;
  // router
  const { workspaceSlug } = useParams();
  // refs
  const inputRef = useRef<HTMLInputElement | null>(null);
  // states
  const [query, setQuery] = useState("");
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  // CCI: narrowing the list of candidates, not the search text. Kept as state rather than folded
  // into `query` so a filter survives typing a name and clearing it again.
  const [disciplineFilter, setDisciplineFilter] = useState<string | null>(null);
  const [availableOnly, setAvailableOnly] = useState(false);

  // CCI: declared hours for the current week, shown beside each name so the person allocating
  // work can see capacity at the moment they choose — rather than having to leave, read the
  // roster, and come back.
  //
  // Fetched only while the dropdown is OPEN. This component mounts once per work item in a list
  // view, so an unconditional fetch would fire a request per row on every page load. SWR dedupes
  // on the shared key, so many open dropdowns still cost one request.
  const availabilityWeek = weekStartFor();
  const { data: availabilityRows } = useSWR(
    isOpen && workspaceSlug ? `WORKSPACE_MEMBER_AVAILABILITY_${workspaceSlug}_${availabilityWeek}` : null,
    isOpen && workspaceSlug
      ? () => memberOptionsWorkspaceService.fetchMemberAvailability(workspaceSlug.toString(), availabilityWeek)
      : null,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const hoursByMemberId = new Map<string, number>();
  // The whole row, not just the number: the hover card shows the note and the repeating flag.
  const availabilityByMemberId = new Map<string, TMemberAvailability>();
  (availabilityRows || []).forEach((row) => {
    hoursByMemberId.set(row.member_id, row.available_hours);
    availabilityByMemberId.set(row.member_id, row);
  });

  // Open work items each member already holds, workspace-wide. Hours alone answer "who is free";
  // hours beside load answer "who should take this". Same open-only gate as the availability
  // fetch above.
  const { data: workloadRows } = useSWR(
    isOpen && workspaceSlug ? `WORKSPACE_MEMBER_WORKLOAD_${workspaceSlug}` : null,
    isOpen && workspaceSlug ? () => memberOptionsWorkspaceService.fetchMemberWorkload(workspaceSlug.toString()) : null,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const openIssuesByMemberId = new Map<string, number>();
  (workloadRows || []).forEach((row) => openIssuesByMemberId.set(row.member_id, row.open_issues));

  // What each candidate works on, so "who should take this" can be narrowed to the people who
  // could actually do it. Same open-only gate as the two fetches above.
  const { data: disciplineData } = useSWR(
    isOpen && workspaceSlug ? `WORKSPACE_MEMBER_DISCIPLINES_${workspaceSlug}` : null,
    isOpen && workspaceSlug
      ? () => memberOptionsWorkspaceService.fetchMemberDisciplines(workspaceSlug.toString())
      : null,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const disciplinesByMemberId = new Map<string, string[]>();
  (disciplineData?.members || []).forEach((row) => disciplinesByMemberId.set(row.member_id, row.disciplines));
  const disciplineLabel = new Map((disciplineData?.choices || []).map((c) => [c.value, c.label]));

  // Offer only the disciplines somebody in THIS list actually has. Eleven chips in a 192px
  // dropdown, nine of which match nobody, is a worse list than no chips.
  const availableDisciplines = (disciplineData?.choices || []).filter((c) =>
    (memberIds || []).some((id) => disciplinesByMemberId.get(id)?.includes(c.value))
  );

  const hasHours = (userId: string) => (hoursByMemberId.get(userId) ?? 0) > 0;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  const {
    project: { bulkAddMembersToProject },
    workspace: { isUserSuspended, workspaceMemberIds, getWorkspaceMemberDetails },
  } = useMember();
  const canInvite = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const canAddToProject =
    !!projectId &&
    allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug?.toString(), projectId);
  const [addingId, setAddingId] = useState<string | null>(null);
  const { isMobile } = usePlatformOS();
  // popper-js init
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
    modifiers: [
      {
        name: "preventOverflow",
        options: {
          padding: 12,
        },
      },
    ],
  });

  useEffect(() => {
    if (isOpen) {
      onDropdownOpen?.();
      if (!isMobile) {
        // oxlint-disable-next-line no-unused-expressions
        inputRef.current && inputRef.current.focus();
      }
    }
    // Pre-existing upstream effect. Both warnings here predate this file being touched; adding
    // onDropdownOpen to the deps would change how often the callback fires, which is a behaviour
    // change unrelated to showing availability.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isMobile]);

  const searchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (query !== "" && e.key === "Escape") {
      e.stopPropagation();
      setQuery("");
    }
  };

  const visibleMemberIds = memberIds?.filter((userId) => {
    if (availableOnly && !hasHours(userId)) return false;
    if (disciplineFilter && !disciplinesByMemberId.get(userId)?.includes(disciplineFilter)) return false;
    return true;
  });

  const options = visibleMemberIds
    ?.map((userId) => {
      const userDetails = getUserDetails(userId);
      return {
        value: userId,
        // Discipline labels join the search text, so typing "front" narrows to Frontend people
        // without touching the chips - the two ways of narrowing compose rather than compete.
        user: userDetails,
        disciplineText: (disciplinesByMemberId.get(userId) || []).map((d) => disciplineLabel.get(d) ?? d).join(" "),
        content: (
          <MemberHoverCard
            userId={userId}
            userDetails={userDetails}
            availability={availabilityByMemberId.get(userId)}
            disciplines={disciplinesByMemberId.get(userId) ?? []}
            disciplineLabel={(slug) => disciplineLabel.get(slug) ?? slug}
            openIssues={openIssuesByMemberId.get(userId)}
          >
            <MemberPickerRow
              userId={userId}
              user={userDetails}
              isCurrentUser={currentUser?.id === userId}
              isSuspended={isUserSuspended(userId, workspaceSlug?.toString())}
              trailing={
                // "15h · 4 open": a declared figure beside a counted one, kept apart because they
                // are different kinds of number. Silence stays blank rather than dashed.
                (hoursByMemberId.has(userId) || openIssuesByMemberId.has(userId)) && (
                  <span className="flex-shrink-0 text-11 whitespace-nowrap text-tertiary tabular-nums">
                    {hoursByMemberId.has(userId) &&
                      formatDeclaredHoursShort(
                        hoursByMemberId.get(userId) ?? 0,
                        availabilityByMemberId.get(userId)?.is_persistent ?? false
                      )}
                    {hoursByMemberId.has(userId) && openIssuesByMemberId.has(userId) && " · "}
                    {openIssuesByMemberId.has(userId) && `${openIssuesByMemberId.get(userId)} open`}
                  </span>
                )
              }
            />
          </MemberHoverCard>
        ),
      };
    })
    .filter((o) => !!o);

  const filteredOptions = sortByCurrentUserThenSelected(
    // Name, username and email all match (see memberMatchesSearch); discipline labels too, so
    // typing "front" narrows to Frontend people.
    query.trim() === ""
      ? options
      : options?.filter(
          (o) =>
            memberMatchesSearch(o.user, query) || o.disciplineText.toLowerCase().includes(query.trim().toLowerCase())
        ),
    value,
    currentUser?.id
  );

  // CCI: people in the workspace but not in this project, shown under the matches once something
  // is typed, so "not in the list" is one click from fixed instead of a trip to settings. Guests,
  // bots and suspended members are left out: none can be made a project member from here.
  const listedIds = new Set(memberIds ?? []);
  const outsideIds =
    canAddToProject && query.trim() !== ""
      ? (workspaceMemberIds ?? [])
          .filter((id) => {
            if (listedIds.has(id)) return false;
            const details = getWorkspaceMemberDetails(id);
            if (!details?.member || !details.is_active || details.member.is_bot) return false;
            if ((details.role ?? 0) < EUserPermissions.MEMBER) return false;
            return memberMatchesSearch(details.member, query);
          })
          .slice(0, 5)
      : [];

  const addToProjectAndSelect = async (userId: string) => {
    if (!workspaceSlug || !projectId) return;
    setAddingId(userId);
    try {
      // A workspace admin can only join a project as an admin; the API rejects a lower role.
      const role =
        getWorkspaceMemberDetails(userId)?.role === EUserPermissions.ADMIN
          ? EUserPermissions.ADMIN
          : EUserPermissions.MEMBER;
      await bulkAddMembersToProject(workspaceSlug.toString(), projectId, {
        members: [{ member_id: userId, role }],
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: `${getMemberName(getUserDetails(userId))} added to the project` });
      onSelectMember?.(userId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Could not add them to the project" });
    } finally {
      setAddingId(null);
    }
  };

  return createPortal(
    <Combobox.Options data-prevent-outside-click static>
      <div
        className={cn(
          // w-72, not the w-48 this inherited: the row now carries a real name, the handle where it
          // differs, and hours beside an open count. At 192px that truncated people mid-name, which
          // defeats the point of showing names at all.
          // CCI: w-80 with two-line rows (name, then username and email). The old one-line, 11px
          // rows truncated people mid-name and gave no way to tell two Daniels apart.
          "z-30 my-1 w-80 max-w-[calc(100vw-24px)] rounded-md border-[0.5px] border-strong bg-surface-1 p-1.5 text-13 shadow-raised-200 focus:outline-none",
          optionsClassName
        )}
        ref={setPopperElement}
        style={{
          ...styles.popper,
        }}
        {...attributes.popper}
      >
        <div className="flex h-8 items-center gap-2 rounded-sm border border-subtle bg-surface-2 px-2 focus-within:border-accent-strong">
          <SearchIcon className="size-4 flex-shrink-0 text-placeholder" strokeWidth={1.5} />
          <Combobox.Input
            as="input"
            ref={inputRef}
            className="w-full bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, username or email"
            // A people search, not a form field: without this Chrome reads "email" in the
            // placeholder and offers saved addresses, anchored where the field was before the
            // popover was positioned.
            autoComplete="off"
            name="member-search"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            displayValue={(assigned: any) => assigned?.name}
            onKeyDown={searchInputKeyDown}
          />
        </div>
        {/* CCI: narrow the candidates before reading them. Only rendered once there is something
            to narrow by, so the dropdown is unchanged for anyone whose workspace has no
            disciplines recorded. Scrolls sideways rather than wrapping - a filter row that grows
            to three lines pushes the people themselves out of view, which defeats it. */}
        {(availableDisciplines.length > 0 || hoursByMemberId.size > 0) && (
          <div className="mt-1.5 flex gap-1 overflow-x-auto pb-0.5 whitespace-nowrap">
            {hoursByMemberId.size > 0 && (
              <button
                type="button"
                onClick={() => setAvailableOnly((v) => !v)}
                className={cn(
                  "flex-shrink-0 rounded-sm border px-1.5 py-0.5 text-11",
                  availableOnly
                    ? "border-accent-strong bg-accent-primary text-on-color"
                    : "border-subtle text-tertiary hover:text-secondary"
                )}
              >
                Has hours
              </button>
            )}
            {availableDisciplines.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setDisciplineFilter((v) => (v === c.value ? null : c.value))}
                className={cn(
                  "flex-shrink-0 rounded-sm border px-1.5 py-0.5 text-11",
                  disciplineFilter === c.value
                    ? "border-accent-strong bg-accent-primary text-on-color"
                    : "border-subtle text-tertiary hover:text-secondary"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
        <div className="mt-1.5 max-h-72 space-y-0.5 overflow-y-auto">
          {filteredOptions ? (
            filteredOptions.length > 0 ? (
              filteredOptions.map(
                (option) =>
                  option && (
                    <Combobox.Option
                      key={option.value}
                      value={option.value}
                      className={({ active, selected }) =>
                        cn(
                          "flex w-full items-center justify-between gap-2 truncate rounded-sm px-1.5 py-1.5 select-none",
                          active && "bg-layer-transparent-hover",
                          selected ? "text-primary" : "text-secondary",
                          isUserSuspended(option.value, workspaceSlug?.toString())
                            ? "cursor-not-allowed"
                            : "cursor-pointer"
                        )
                      }
                      disabled={isUserSuspended(option.value, workspaceSlug?.toString())}
                    >
                      {({ selected }) => (
                        <>
                          <span className="flex-grow truncate">{option.content}</span>
                          {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                          {isUserSuspended(option.value, workspaceSlug?.toString()) && (
                            <Pill variant={EPillVariant.DEFAULT} size={EPillSize.XS} className="border-none">
                              Suspended
                            </Pill>
                          )}
                        </>
                      )}
                    </Combobox.Option>
                  )
              )
            ) : (
              outsideIds.length === 0 && (
                <p className="px-1.5 py-2 text-13 text-placeholder">
                  {disciplineFilter || availableOnly
                    ? "No one matches those filters"
                    : query.trim()
                      ? `No one matches “${query.trim()}”`
                      : t("no_matching_results")}
                </p>
              )
            )
          ) : (
            <p className="px-1.5 py-2 text-13 text-placeholder">{t("loading")}</p>
          )}
          {clearLabel && value && !Array.isArray(value) && query.trim() === "" && (
            <Combobox.Option
              value={null}
              className={({ active }) =>
                cn(
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-sm px-1.5 py-1.5 text-tertiary select-none",
                  active && "bg-layer-transparent-hover"
                )
              }
            >
              <span className="flex size-6 items-center justify-center">
                <Ban className="size-3.5 rotate-90" />
              </span>
              {clearLabel}
            </Combobox.Option>
          )}
          {outsideIds.length > 0 && (
            <div className="mt-1 border-t border-subtle pt-1">
              <p className="px-1.5 py-1 text-11 font-medium text-tertiary">In the workspace, not this project</p>
              {outsideIds.map((userId) => (
                <button
                  key={userId}
                  type="button"
                  disabled={addingId !== null}
                  onClick={() => void addToProjectAndSelect(userId)}
                  className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1.5 text-left hover:bg-layer-transparent-hover disabled:opacity-60"
                >
                  <span className="min-w-0 flex-grow">
                    <MemberPickerRow userId={userId} user={getUserDetails(userId)} />
                  </span>
                  <span className="flex-shrink-0 text-11 font-medium text-accent-primary">
                    {addingId === userId ? "Adding…" : "Add to project"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-1 border-t border-subtle pt-1">
          {canInvite ? (
            <MemberInvite
              query={query}
              memberIds={memberIds ?? []}
              projectId={projectId}
              pendingGrant={pendingGrant}
              onInvited={onInvited}
              onSelect={(userId) => onSelectMember?.(userId)}
            />
          ) : (
            <p className="px-1.5 py-1.5 text-11 text-tertiary">Not listed? A workspace admin can invite them.</p>
          )}
        </div>
      </div>
    </Combobox.Options>,
    document.body
  );
});

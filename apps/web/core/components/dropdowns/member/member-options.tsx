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
import { CheckIcon, SearchIcon, SuspendedUserIcon } from "@plane/propel/icons";
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import type { IUserLite } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL, getMemberHandle, getMemberName, sortByCurrentUserThenSelected } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import { usePlatformOS } from "@/hooks/use-platform-os";
// lib
import { weekStartFor } from "@/lib/availability-week";
// services
import { WorkspaceService } from "@/services/workspace.service";

const memberOptionsWorkspaceService = new WorkspaceService();

interface Props {
  className?: string;
  getUserDetails: (userId: string) => IUserLite | undefined;
  isOpen: boolean;
  memberIds?: string[];
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
  (availabilityRows || []).forEach((row) => hoursByMemberId.set(row.member_id, row.available_hours));

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
  const {
    workspace: { isUserSuspended },
  } = useMember();
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
        query: `${getMemberName(userDetails)} ${userDetails?.display_name} ${(disciplinesByMemberId.get(userId) || [])
          .map((d) => disciplineLabel.get(d) ?? d)
          .join(" ")}`,
        content: (
          <div className="flex items-center gap-2">
            <div className="w-4">
              {isUserSuspended(userId, workspaceSlug?.toString()) ? (
                <SuspendedUserIcon className="h-3.5 w-3.5 text-placeholder" />
              ) : (
                <Avatar
                  name={getMemberName(userDetails)}
                  src={getFileURL(userDetails?.avatar_url ?? "")}
                  fallbackSeed={userId}
                />
              )}
            </div>
            <span
              className={cn(
                "flex-grow truncate",
                isUserSuspended(userId, workspaceSlug?.toString()) ? "text-placeholder" : ""
              )}
            >
              {/* The real name, not the handle: display_name is the email local part for almost
                  everyone here, and nobody recognises `dikedaniel7917` in a list of seventy. The
                  handle follows in muted text ONLY when it differs, so it disambiguates without
                  putting a redundant second string under every row. */}
              {currentUser?.id === userId ? t("you") : getMemberName(userDetails)}
              {currentUser?.id !== userId && getMemberHandle(userDetails) && (
                <span className="ml-1.5 text-tertiary">{getMemberHandle(userDetails)}</span>
              )}
            </span>
            {/* Silence is left blank rather than dashed: this is a picking surface, and a column
                of dashes would add noise to every row without helping anyone choose. The roster
                is where "who hasn't told us" gets answered. */}
            {/* "15h · 4 open" — a declared figure beside a counted one. Separated rather than
                subtracted because they are different KINDS of number: one is what the person
                said, the other is what is true. Nothing in this edition denominates load in
                hours, so an "hours left" would be invented arithmetic. */}
            {(hoursByMemberId.has(userId) || openIssuesByMemberId.has(userId)) && (
              <span className="text-xs flex-shrink-0 whitespace-nowrap text-tertiary tabular-nums">
                {hoursByMemberId.has(userId) && `${hoursByMemberId.get(userId)}h`}
                {hoursByMemberId.has(userId) && openIssuesByMemberId.has(userId) && " · "}
                {openIssuesByMemberId.has(userId) && `${openIssuesByMemberId.get(userId)} open`}
              </span>
            )}
          </div>
        ),
      };
    })
    .filter((o) => !!o);

  const filteredOptions = sortByCurrentUserThenSelected(
    query === "" ? options : options?.filter((o) => o?.query.toLowerCase().includes(query.toLowerCase())),
    value,
    currentUser?.id
  );

  return createPortal(
    <Combobox.Options data-prevent-outside-click static>
      <div
        className={cn(
          // w-72, not the w-48 this inherited: the row now carries a real name, the handle where it
          // differs, and hours beside an open count. At 192px that truncated people mid-name, which
          // defeats the point of showing names at all.
          "z-30 my-1 w-72 rounded-sm border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 text-11 shadow-raised-200 focus:outline-none",
          optionsClassName
        )}
        ref={setPopperElement}
        style={{
          ...styles.popper,
        }}
        {...attributes.popper}
      >
        <div className="flex items-center gap-1.5 rounded-sm border border-subtle bg-surface-2 px-2">
          <SearchIcon className="h-3.5 w-3.5 text-placeholder" strokeWidth={1.5} />
          <Combobox.Input
            as="input"
            ref={inputRef}
            className="w-full bg-transparent py-1 text-11 text-secondary placeholder:text-placeholder focus:outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
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
        <div className="mt-2 max-h-48 space-y-1 overflow-y-scroll">
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
                          "flex w-full items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 select-none",
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
              <p className="px-1.5 py-1 text-placeholder italic">
                {disciplineFilter || availableOnly ? "No one matches those filters" : t("no_matching_results")}
              </p>
            )
          ) : (
            <p className="px-1.5 py-1 text-placeholder italic">{t("loading")}</p>
          )}
        </div>
      </div>
    </Combobox.Options>,
    document.body
  );
});

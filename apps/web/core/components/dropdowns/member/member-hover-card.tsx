/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { ROLE } from "@plane/constants";
import { Popover } from "@plane/propel/popover";
import type { IUserLite, TMemberAvailability } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getFileURL, getMemberHandle, getMemberName } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";

type Props = {
  userId: string;
  userDetails: IUserLite | undefined;
  availability?: TMemberAvailability;
  disciplines: string[];
  disciplineLabel: (slug: string) => string;
  openIssues?: number;
  children: React.ReactNode;
};

/**
 * CCI: who this person is, on hover, at the moment you are deciding whether to hand them work.
 *
 * The option row can only carry a name and two numbers before it stops being scannable, but the
 * decision wants more than that - what they do, what they said about this week, what they are
 * already holding. This is where the rest goes.
 *
 * Every value shown is already fetched by the dropdown for its own rows, so opening a card costs
 * no request. Nothing here is loaded per-hover on purpose: a card that fetches would fire once per
 * row as someone runs down the list.
 */
export const MemberHoverCard = observer(function MemberHoverCard(props: Props) {
  const { userId, userDetails, availability, disciplines, disciplineLabel, openIssues, children } = props;
  const {
    workspace: { getWorkspaceMemberDetails },
  } = useMember();

  const role = getWorkspaceMemberDetails(userId)?.role;
  const handle = getMemberHandle(userDetails);
  const hours = availability?.available_hours;

  return (
    <Popover delay={350} openOnHover>
      {/* Rendered as a div, not the default button: this sits inside a Combobox.Option, and a
          nested button swallows the click that selects the person. */}
      <Popover.Button render={<div className="w-full" />}>{children}</Popover.Button>
      <Popover.Panel side="right" align="start" sideOffset={12}>
        <div className="w-64 rounded-lg border-[0.5px] border-strong bg-surface-1 p-3 text-11 shadow-raised-200">
          <div className="flex items-center gap-3">
            <Avatar
              src={getFileURL(userDetails?.avatar_url ?? "")}
              name={getMemberName(userDetails)}
              fallbackSeed={userId}
              size={40}
              className="text-18"
              showTooltip={false}
            />
            <div className="min-w-0">
              <p className="truncate text-13 font-medium text-primary">{getMemberName(userDetails)}</p>
              <p className="truncate text-tertiary">
                {handle && <span>{handle}</span>}
                {handle && role ? " · " : ""}
                {role ? ROLE[role] : ""}
              </p>
            </div>
          </div>

          {userDetails?.email && <p className="mt-2.5 truncate text-tertiary">{userDetails.email}</p>}

          <dl className="mt-2.5 space-y-1.5 border-t border-subtle pt-2.5">
            <Row label="Discipline">
              {disciplines.length === 0 ? (
                <span className="text-tertiary">Not set</span>
              ) : (
                <span className="flex flex-wrap justify-end gap-1">
                  {disciplines.map((slug) => (
                    <span key={slug} className="rounded border border-subtle bg-surface-2 px-1.5 py-0.5">
                      {disciplineLabel(slug)}
                    </span>
                  ))}
                </span>
              )}
            </Row>

            <Row label="This week">
              {hours === undefined ? (
                // Distinct from a declared 0: silence is a person to chase, zero is an answer.
                <span className="text-tertiary">No answer</span>
              ) : (
                <span className="text-secondary">
                  <span className="font-medium tabular-nums">{hours}h</span>
                  {availability?.is_persistent && <span className="text-tertiary"> · repeats</span>}
                </span>
              )}
            </Row>

            {availability?.note && (
              <Row label="Free">
                <span className="text-right text-secondary">{availability.note}</span>
              </Row>
            )}

            <Row label="Holding">
              <span className="text-secondary tabular-nums">
                {openIssues === undefined ? "—" : `${openIssues} open`}
              </span>
            </Row>
          </dl>
        </div>
      </Popover.Panel>
    </Popover>
  );
});

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-3">
    <dt className="flex-shrink-0 text-tertiary">{label}</dt>
    <dd className="min-w-0 text-right">{children}</dd>
  </div>
);

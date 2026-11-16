/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IIssueLabel } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getFileURL, getMemberName } from "@plane/utils";
// components
import { MemberSelect } from "@/components/project/member-select";
// helpers
import { isCampusLabel } from "@/helpers/intake-campus";
// hooks
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";

type Props = {
  label: IIssueLabel;
  isEditable: boolean;
};

/** CCI: support desk. A campus label's owner receives new support requests from that campus. */
export const CampusLabelOwner = observer(function CampusLabelOwner(props: Props) {
  const { label, isEditable } = props;
  const { workspaceSlug, projectId } = useParams();
  const { projectLabels, updateLabel } = useLabel();
  const {
    getUserDetails,
    project: { projectMemberIds, fetchProjectMembers },
  } = useMember();

  useEffect(() => {
    if (projectMemberIds === null && workspaceSlug && projectId)
      void fetchProjectMembers(workspaceSlug.toString(), projectId.toString());
  }, [projectMemberIds, workspaceSlug, projectId, fetchProjectMembers]);

  if (!isCampusLabel(label, projectLabels)) return null;

  const owner = label.default_assignee ? getUserDetails(label.default_assignee) : undefined;

  const handleChange = async (value: string) => {
    if (!workspaceSlug || !projectId) return;
    const defaultAssignee = value === "none" ? null : value;
    if (defaultAssignee === (label.default_assignee ?? null)) return;
    try {
      await updateLabel(workspaceSlug.toString(), projectId.toString(), label.id, {
        default_assignee: defaultAssignee,
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Owner not saved",
        message: "Only an active project member who can work on items can own a campus.",
      });
    }
  };

  return (
    <div className="!mt-0 mr-20 flex flex-shrink-0 items-center gap-2">
      <span className="text-13 text-tertiary">Owner</span>
      {isEditable ? (
        <MemberSelect value={label.default_assignee ?? null} onChange={handleChange} />
      ) : owner ? (
        <span className="flex items-center gap-2 text-13 text-secondary">
          <Avatar name={owner.display_name} src={getFileURL(owner.avatar_url)} />
          {getMemberName(owner)}
        </span>
      ) : (
        <span className="text-13 text-placeholder">None</span>
      )}
    </div>
  );
});

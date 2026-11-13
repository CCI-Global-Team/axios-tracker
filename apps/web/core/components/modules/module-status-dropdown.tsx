/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { MODULE_STATUS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TModuleStatus } from "@plane/propel/icons";
import { ModuleStatusIcon } from "@plane/propel/icons";
import type { IModule } from "@plane/types";
import { CustomSelect } from "@plane/ui";

type Props = {
  isDisabled: boolean;
  moduleDetails: IModule;
  handleModuleDetailsChange: (payload: Partial<IModule>) => Promise<void>;
};

export const ModuleStatusDropdown = observer(function ModuleStatusDropdown(props: Props) {
  const { isDisabled, moduleDetails, handleModuleDetailsChange } = props;
  const { t } = useTranslation();
  const moduleStatus = MODULE_STATUS.find((status) => status.value === moduleDetails.status);

  if (!moduleStatus) return <></>;

  return (
    <CustomSelect
      customButton={
        // CCI: status as a coloured dot and plain text, not a tinted pill.
        <span
          className={`flex h-6 min-w-20 items-center gap-1.5 rounded-sm px-1.5 text-12 text-secondary hover:bg-layer-1 ${
            isDisabled ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <span className="size-2 flex-shrink-0 rounded-full" style={{ backgroundColor: moduleStatus.color }} />
          {t(moduleStatus.i18n_label)}
        </span>
      }
      value={moduleStatus?.value}
      onChange={(val: TModuleStatus) => {
        handleModuleDetailsChange({ status: val });
      }}
      disabled={isDisabled}
    >
      {MODULE_STATUS.map((status) => (
        <CustomSelect.Option key={status.value} value={status.value}>
          <div className="flex items-center gap-2">
            <ModuleStatusIcon status={status.value} />
            {t(status.i18n_label)}
          </div>
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );
});

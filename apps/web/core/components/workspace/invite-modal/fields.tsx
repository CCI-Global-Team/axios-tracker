/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import type { Control, FieldArrayWithId, FormState } from "react-hook-form";
import { Controller } from "react-hook-form";
import useSWR from "swr";
// plane imports
import { ROLE } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";
import { CustomSearchSelect, CustomSelect, Input } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import type { InvitationFormValues } from "@/hooks/use-workspace-invitation";
import { WorkspaceService } from "@/services/workspace.service";

type TInvitationFieldsProps = {
  workspaceSlug: string;
  fields: FieldArrayWithId<InvitationFormValues, "emails", "id">[];
  control: Control<InvitationFormValues>;
  formState: FormState<InvitationFormValues>;
  remove: (index: number) => void;
  className?: string;
};

const inviteFieldsWorkspaceService = new WorkspaceService();

export const InvitationFields = observer(function InvitationFields(props: TInvitationFieldsProps) {
  const {
    workspaceSlug,
    fields,
    control,
    formState: { errors },
    remove,
    className,
  } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { workspaceInfoBySlug } = useUserPermissions();
  // derived values
  const currentWorkspaceRole = workspaceInfoBySlug(workspaceSlug.toString())?.role;

  // The discipline vocabulary comes from the API rather than a local constant, so the field can
  // never offer a value the backend will reject.
  const { data: disciplineData } = useSWR(
    workspaceSlug ? `WORKSPACE_MEMBER_DISCIPLINES_${workspaceSlug}` : null,
    workspaceSlug ? () => inviteFieldsWorkspaceService.fetchMemberDisciplines(workspaceSlug.toString()) : null,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const disciplineOptions = disciplineData?.choices ?? [];
  const labelForDiscipline = (slug: string) => disciplineOptions.find((d) => d.value === slug)?.label ?? slug;
  /** First name plus a count. Listing every pick wrapped the button to four lines on three
   *  selections and dragged the whole row's height with it. */
  const describeDisciplines = (selected?: string[]) => {
    const picks = selected ?? [];
    if (picks.length === 0) return "Discipline";
    if (picks.length === 1) return labelForDiscipline(picks[0]);
    return `${labelForDiscipline(picks[0])} +${picks.length - 1}`;
  };

  return (
    <div className={cn("mb-3 space-y-4", className)}>
      {fields.map((field, index) => (
        <div
          key={field.id}
          className="group relative mb-1 flex w-full items-start justify-between gap-x-4 text-body-xs-regular"
        >
          <div className="w-full">
            <Controller
              control={control}
              name={`emails.${index}.email`}
              rules={{
                required: t("workspace_settings.settings.members.modal.errors.required"),
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: t("workspace_settings.settings.members.modal.errors.invalid"),
                },
              }}
              render={({ field: { value, onChange, ref } }) => (
                <>
                  <Input
                    id={`emails.${index}.email`}
                    name={`emails.${index}.email`}
                    type="text"
                    value={value}
                    onChange={onChange}
                    ref={ref}
                    hasError={Boolean(errors.emails?.[index]?.email)}
                    placeholder={t("workspace_settings.settings.members.modal.placeholder")}
                    className="w-full text-caption-sm-regular sm:text-body-xs-regular"
                  />
                  {errors.emails?.[index]?.email && (
                    <span className="ml-1 text-caption-sm-regular text-danger-primary">
                      {errors.emails?.[index]?.email?.message}
                    </span>
                  )}
                </>
              )}
            />
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2">
            {/* CCI: set the discipline at invite time. Waiting until the person accepts means
                remembering to come back for it, which is how it ends up never being set. */}
            <div className="flex flex-col gap-1">
              <Controller
                control={control}
                name={`emails.${index}.disciplines`}
                render={({ field: { value, onChange } }) => (
                  <CustomSearchSelect
                    value={value ?? []}
                    onChange={(next: string[]) => onChange(next.slice(0, 3))}
                    options={disciplineOptions.map((d) => ({
                      value: d.value,
                      query: d.label,
                      content: <div>{d.label}</div>,
                    }))}
                    label={
                      // One line, always. Listing every selection wrapped the button to four
                      // lines on three picks and dragged the whole row's height with it, so the
                      // first name carries the label and a count carries the rest. The title
                      // holds the full list for anyone who needs to check it.
                      <span
                        title={(value ?? []).map((slug: string) => labelForDiscipline(slug)).join(", ")}
                        className="block truncate text-caption-sm-regular whitespace-nowrap sm:text-body-xs-regular"
                      >
                        {describeDisciplines(value)}
                      </span>
                    }
                    className="w-32 shrink-0"
                    buttonClassName="truncate"
                    multiple
                    input
                  />
                )}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Controller
                control={control}
                name={`emails.${index}.role`}
                rules={{ required: true }}
                render={({ field: { value, onChange } }) => (
                  <CustomSelect
                    value={value}
                    label={<span className="text-caption-sm-regular sm:text-body-xs-regular">{ROLE[value]}</span>}
                    onChange={onChange}
                    className="w-24 flex-grow"
                    input
                  >
                    {Object.entries(ROLE).map(([key, roleLabel]) => {
                      if (currentWorkspaceRole && currentWorkspaceRole >= parseInt(key))
                        return (
                          <CustomSelect.Option key={key} value={parseInt(key)}>
                            {roleLabel}
                          </CustomSelect.Option>
                        );
                    })}
                  </CustomSelect>
                )}
              />
            </div>
            {fields.length > 1 && (
              <div className="flex-item flex w-6">
                <button
                  type="button"
                  className="place-items-center self-center rounded-sm"
                  onClick={() => remove(index)}
                >
                  <CloseIcon className="h-4 w-4 text-secondary" />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
});

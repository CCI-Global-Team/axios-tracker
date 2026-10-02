/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400)
import { useEffect } from "react";
import { observer } from "mobx-react";
import { Controller, useForm } from "react-hook-form";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRelease, TReleaseFormData } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { renderFormattedPayloadDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// hooks
import { useRelease } from "@/hooks/store/use-release";
import { useUser } from "@/hooks/store/user";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  /** when given, the modal edits this release instead of creating one */
  data?: TRelease;
  onCreated?: (release: TRelease) => void;
};

export const CreateUpdateReleaseModal = observer(function CreateUpdateReleaseModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, data, onCreated } = props;
  // store hooks
  const { createRelease, updateRelease } = useRelease();
  const { data: currentUser } = useUser();
  // form
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TReleaseFormData>();

  useEffect(() => {
    if (!isOpen) return;
    reset({
      name: data?.name ?? "",
      version: data?.version ?? "",
      target_date: data?.target_date ?? null,
      owned_by: data ? data.owned_by : (currentUser?.id ?? null),
    });
  }, [isOpen, data, currentUser?.id, reset]);

  const onSubmit = async (formData: TReleaseFormData) => {
    try {
      if (data) {
        await updateRelease(workspaceSlug, projectId, data.id, formData);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Release updated", message: `${formData.name} was saved.` });
      } else {
        const release = await createRelease(workspaceSlug, projectId, formData);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Release created", message: `${release.name} is planning.` });
        onCreated?.(release);
      }
      onClose();
    } catch (error) {
      const body = error as Record<string, unknown> | undefined;
      const message =
        (Array.isArray(body?.name) && String(body?.name[0])) ||
        (typeof body?.error === "string" && body.error) ||
        "The release could not be saved. Please try again.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message });
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-4 p-5">
          <h3 className="text-18 font-medium text-secondary">{data ? "Edit release" : "New release"}</h3>
          <div className="space-y-1">
            <Controller
              control={control}
              name="name"
              rules={{
                required: "Name is required",
                maxLength: { value: 255, message: "Name should be less than 255 characters" },
              }}
              render={({ field: { value, onChange } }) => (
                <Input
                  id="release-name"
                  name="name"
                  type="text"
                  value={value}
                  onChange={onChange}
                  hasError={Boolean(errors?.name)}
                  placeholder="Name, e.g. October launch"
                  className="w-full text-14"
                  // oxlint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                />
              )}
            />
            <span className="text-11 text-danger-primary">{errors?.name?.message}</span>
          </div>
          <Controller
            control={control}
            name="version"
            rules={{ maxLength: { value: 64, message: "Version should be less than 64 characters" } }}
            render={({ field: { value, onChange } }) => (
              <Input
                id="release-version"
                name="version"
                type="text"
                value={value}
                onChange={onChange}
                hasError={Boolean(errors?.version)}
                placeholder="Version (optional), e.g. 2.4.0"
                className="w-full text-14"
              />
            )}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Controller
              control={control}
              name="target_date"
              render={({ field: { value, onChange } }) => (
                <div className="h-7">
                  <DateDropdown
                    value={value}
                    onChange={(val) => onChange(val ? (renderFormattedPayloadDate(val) ?? null) : null)}
                    buttonVariant="border-with-text"
                    placeholder="Target date"
                  />
                </div>
              )}
            />
            <Controller
              control={control}
              name="owned_by"
              render={({ field: { value, onChange } }) => (
                <div className="h-7">
                  <MemberDropdown
                    value={value}
                    onChange={onChange}
                    projectId={projectId}
                    multiple={false}
                    buttonVariant="border-with-text"
                    placeholder="Owner"
                  />
                </div>
              )}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            {data ? (isSubmitting ? "Saving" : "Save") : isSubmitting ? "Creating" : "Create release"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});

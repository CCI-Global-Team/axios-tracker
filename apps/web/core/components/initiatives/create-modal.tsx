/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TInitiative, TInitiativeCreatePayload } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
import { renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useInitiative } from "@/hooks/store/use-initiative";
import { useUser } from "@/hooks/store/user";
import { initiativeErrorMessage } from "./error";
import { InitiativeExample } from "./explainer";

type TForm = Required<Pick<TInitiativeCreatePayload, "name" | "description">> &
  Pick<TInitiative, "lead_id" | "target_date">;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  /** when given, the modal edits this initiative instead of creating one */
  data?: TInitiative;
  onCreated?: (initiative: TInitiative) => void;
};

export const CreateUpdateInitiativeModal = observer(function CreateUpdateInitiativeModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, data, onCreated } = props;
  const { createInitiative, updateInitiative } = useInitiative();
  const { data: currentUser } = useUser();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TForm>();

  useEffect(() => {
    if (!isOpen) return;
    reset({
      name: data?.name ?? "",
      description: data?.description ?? "",
      target_date: data?.target_date ?? null,
      lead_id: data ? data.lead_id : (currentUser?.id ?? null),
    });
  }, [isOpen, data, currentUser?.id, reset]);

  const onSubmit = async (form: TForm) => {
    const payload = { ...form, name: form.name.trim() };
    try {
      if (data) {
        await updateInitiative(workspaceSlug, data.id, payload);
      } else {
        const initiative = await createInitiative(workspaceSlug, payload);
        onCreated?.(initiative);
      }
      onClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: initiativeErrorMessage(error, "The initiative could not be saved. Please try again."),
      });
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-4 p-5">
          <h3 className="text-18 font-medium text-secondary">{data ? "Edit initiative" : "New initiative"}</h3>
          {!data && <InitiativeExample compact />}
          <div className="space-y-1">
            <Controller
              control={control}
              name="name"
              rules={{
                validate: (v) => !!v.trim() || "Name is required",
                maxLength: { value: 255, message: "Name should be less than 255 characters" },
              }}
              render={({ field: { value, onChange } }) => (
                <Input
                  id="initiative-name"
                  name="name"
                  type="text"
                  value={value}
                  onChange={onChange}
                  hasError={Boolean(errors?.name)}
                  placeholder="The outcome, e.g. Giving"
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
            name="description"
            render={({ field: { value, onChange } }) => (
              <TextArea
                id="initiative-description"
                name="description"
                value={value}
                onChange={onChange}
                placeholder="What it delivers (optional)"
                className="min-h-24 w-full resize-none text-14"
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
              name="lead_id"
              render={({ field: { value, onChange } }) => (
                <div className="h-7">
                  <MemberDropdown
                    value={value}
                    onChange={onChange}
                    multiple={false}
                    buttonVariant="border-with-text"
                    placeholder="Lead"
                    showUserDetails
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
            {data ? (isSubmitting ? "Saving" : "Save") : isSubmitting ? "Creating" : "Create initiative"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});

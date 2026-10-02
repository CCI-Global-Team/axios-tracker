/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400)
import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Search } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TReleaseCandidate } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Input, Loader, ModalCore } from "@plane/ui";
// hooks
import { useRelease } from "@/hooks/store/use-release";
import useDebounce from "@/hooks/use-debounce";
// local imports
import { conflictIdsFromError, releaseIssueKey } from "./helpers";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
  /** ids already in this release, hidden from the list */
  existingIssueIds: string[];
};

export const AddReleaseItemsModal = observer(function AddReleaseItemsModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, releaseId, existingIssueIds } = props;
  // states
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<TReleaseCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // every candidate seen while this modal is open, so a conflict can name items no longer in the list
  const seen = useRef(new Map<string, TReleaseCandidate>());
  // store hooks
  const { fetchCandidates, addReleaseIssues } = useRelease();
  const debouncedSearch = useDebounce(search.trim(), 300);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);
    fetchCandidates(workspaceSlug, projectId, debouncedSearch || undefined)
      .then((results) => {
        if (cancelled) return undefined;
        results.forEach((candidate) => seen.current.set(candidate.id, candidate));
        setCandidates(results);
        return undefined;
      })
      .catch(() => !cancelled && setCandidates([]))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isOpen, debouncedSearch, workspaceSlug, projectId, fetchCandidates]);

  const visible = useMemo(
    () => candidates.filter((candidate) => !existingIssueIds.includes(candidate.id)),
    [candidates, existingIssueIds]
  );

  const handleClose = () => {
    setSearch("");
    setSelected([]);
    setError(null);
    seen.current.clear();
    onClose();
  };

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));

  const handleSubmit = async () => {
    if (selected.length === 0) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await addReleaseIssues(workspaceSlug, projectId, releaseId, selected);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Items added",
        message: `${selected.length} work item${selected.length === 1 ? "" : "s"} added to the release.`,
      });
      handleClose();
    } catch (err) {
      const body = err as Record<string, unknown> | undefined;
      if (body?.status === 409) {
        const names = conflictIdsFromError(body)
          .map((id) => seen.current.get(id))
          .filter((candidate): candidate is TReleaseCandidate => !!candidate)
          .map((candidate) => `${releaseIssueKey(candidate)} ${candidate.name}`);
        setError(
          names.length > 0
            ? `Already in another open release: ${names.join("; ")}. Remove them there first, or untick them here.`
            : typeof body.error === "string"
              ? body.error
              : "Some of these items are already in another open release."
        );
      } else {
        setError(typeof body?.error === "string" ? body.error : "The items could not be added. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="space-y-3 p-5">
        <h3 className="text-18 font-medium text-secondary">Add work items</h3>
        <p className="text-body-xs-regular text-tertiary">
          {search.trim()
            ? "Search results across the project."
            : "Items at Ready for Test or later that are not in an open release. Search to add anything else."}
        </p>
        <div className="flex items-center gap-2 rounded-md border border-subtle px-2">
          <Search className="size-4 shrink-0 text-tertiary" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or number"
            className="min-h-11 w-full border-none text-13 sm:min-h-0"
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        </div>
        <div className="vertical-scrollbar scrollbar-sm max-h-[50vh] overflow-y-auto rounded-md border border-subtle">
          {isLoading && visible.length === 0 ? (
            <Loader className="space-y-1 p-2">
              <Loader.Item height="32px" />
              <Loader.Item height="32px" />
              <Loader.Item height="32px" />
            </Loader>
          ) : visible.length === 0 ? (
            <p className="px-3 py-4 text-center text-body-xs-regular text-tertiary">
              {search.trim() ? "No matching work items." : "Nothing is waiting at Ready for Test or later."}
            </p>
          ) : (
            visible.map((candidate) => (
              <label
                key={candidate.id}
                className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-subtle px-3 py-2 last:border-b-0 hover:bg-layer-transparent-hover sm:min-h-0"
              >
                <Checkbox checked={selected.includes(candidate.id)} onChange={() => toggle(candidate.id)} />
                <span className="shrink-0 text-body-xs-medium text-tertiary">{releaseIssueKey(candidate)}</span>
                <span className="min-w-0 flex-1 truncate text-body-xs-regular text-primary">{candidate.name}</span>
                {candidate.state && (
                  <span className="hidden shrink-0 items-center gap-1 text-body-xs-regular text-secondary sm:flex">
                    <span className="size-2 rounded-full" style={{ backgroundColor: candidate.state.color }} />
                    {candidate.state.name}
                  </span>
                )}
              </label>
            ))
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-body-xs-regular text-danger-primary">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
        <Button variant="secondary" size="lg" className="min-h-11 sm:min-h-0" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="lg"
          className="min-h-11 sm:min-h-0"
          onClick={() => void handleSubmit()}
          loading={isSubmitting}
          disabled={selected.length === 0}
        >
          {selected.length > 0 ? `Add ${selected.length}` : "Add"}
        </Button>
      </div>
    </ModalCore>
  );
});

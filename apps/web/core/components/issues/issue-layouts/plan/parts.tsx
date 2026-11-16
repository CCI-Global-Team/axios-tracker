/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useId, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Popover } from "@plane/propel/popover";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { IssueService } from "@/services/issue/issue.service";
import type { TPlanShared } from "./board";
import type { TPlanKind, TPlanNode } from "./model";
import { statusLabel } from "./model";
import type { TPlanArea, TPlanPerson } from "./use-plan-data";
import { NO_AREA_HUE } from "./use-plan-data";

export const KIND_PILL: Record<TPlanKind, string> = {
  ready: "bg-success-subtle-1 text-success-primary",
  blocked: "bg-warning-subtle text-warning-primary",
  wip: "bg-accent-subtle text-accent-primary",
  done: "bg-layer-2 text-tertiary",
};

/** Upstream (has to happen first) and downstream (waits on the picked item), as CSS colours for SVG strokes. */
export const UP_COLOUR = "var(--txt-warning-primary)";
export const DOWN_COLOUR = "var(--txt-accent-primary)";

export function StatusPill({ node, className }: { node: TPlanNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-11 font-medium whitespace-nowrap",
        KIND_PILL[node.kind],
        className
      )}
    >
      {statusLabel(node)}
    </span>
  );
}

export function AreaDot({ area, className }: { area: TPlanArea | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-[2px]", className)}
      style={{ background: area?.hue ?? NO_AREA_HUE }}
    />
  );
}

export function ItemKey({ node, area }: { node: { key: string }; area: TPlanArea | undefined }) {
  return (
    <span className="font-mono inline-flex items-center gap-1.5 text-11 font-medium whitespace-nowrap text-tertiary tabular-nums">
      <AreaDot area={area} />
      {node.key}
    </span>
  );
}

export function PersonAvatar({ person, size = 18 }: { person: TPlanPerson | undefined; size?: number }) {
  return (
    <Avatar
      name={person?.name ?? "No owner"}
      src={person?.avatarUrl ? getFileURL(person.avatarUrl) : undefined}
      fallbackSeed={person?.id ?? "no-owner"}
      size={size}
      showTooltip={false}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("min-w-0 rounded-lg border border-subtle bg-layer-1 p-4", className)} {...props} />;
}

export function CardTitle({ title, action }: { title: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h3 className="text-13 font-semibold text-primary">{title}</h3>
      {action}
    </div>
  );
}

export function LinkButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-sm text-12 font-medium text-accent-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)]",
        className
      )}
      {...props}
    />
  );
}

function useMedia(query: string, initial: boolean) {
  const [matches, setMatches] = useState(initial);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export const usePhone = () => useMedia("(max-width: 767px)", false);

export function useCanPreview() {
  const phone = usePhone();
  const touchOnly = useMedia("(hover: none)", true);
  return !phone && !touchOnly;
}

type PreviewData = Pick<
  TPlanShared,
  "canPreview" | "workspaceSlug" | "areaById" | "personById" | "hoursOf" | "itemHours"
>;
const descriptions = new Map<string, string>();
const descriptionRequests = new Map<string, Promise<string>>();
const issueService = new IssueService();
const descriptionText = (html: string) => {
  const spaced = html.replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6]|blockquote|pre)>/gi, " ");
  const text = new DOMParser().parseFromString(spaced, "text/html").body.textContent ?? "";
  return text.replace(/\s+/g, " ").trim();
};

export function PlanPreview({
  node,
  data,
  ...buttonProps
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  node: TPlanNode;
  data: PreviewData;
}) {
  const [open, setOpen] = useState(false);
  const previewId = useId();
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(focusTimer.current), []);
  if (!data.canPreview) return <button {...buttonProps} />;
  return (
    <Popover
      open={open}
      onOpenChange={(value, details) => {
        if (details.reason !== "trigger-press") setOpen(value);
      }}
      delay={300}
      openOnHover
      modal={false}
    >
      <Popover.Button
        render={<button {...buttonProps} aria-describedby={open ? previewId : undefined} />}
        onFocus={(e) => {
          clearTimeout(focusTimer.current);
          // a mouse click focuses the card too; only keyboard focus should open the preview
          if (!e.currentTarget.matches(":focus-visible")) return;
          focusTimer.current = setTimeout(() => setOpen(true), 300);
        }}
        onBlur={() => {
          clearTimeout(focusTimer.current);
          setOpen(false);
        }}
      />
      <Popover.Panel
        side="bottom"
        align="start"
        sideOffset={6}
        positionerClassName="z-50"
        initialFocus={false}
        finalFocus={false}
        data-prevent-outside-click=""
      >
        {open && <PlanPreviewCard id={previewId} node={node} data={data} />}
      </Popover.Panel>
    </Popover>
  );
}

export const PlanPreviewCard = observer(function PlanPreviewCard({
  id,
  node,
  data,
}: {
  id?: string;
  node: TPlanNode;
  data: PreviewData;
}) {
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const html = getIssueById(node.id)?.description_html;
  const [description, setDescription] = useState<string | undefined>(() => descriptions.get(node.id));
  useEffect(() => {
    if (typeof html === "string") {
      const text = descriptionText(html);
      descriptions.set(node.id, text);
      setDescription(text);
      return;
    }
    const cached = descriptions.get(node.id);
    if (cached !== undefined) {
      setDescription(cached);
      return;
    }
    let active = true;
    let request = descriptionRequests.get(node.id);
    if (!request) {
      request = issueService
        .retrieve(data.workspaceSlug, node.projectId, node.id)
        .then((issue) => {
          const text = descriptionText(issue.description_html ?? "");
          descriptions.set(node.id, text);
          return text;
        })
        // not cached, so the next open retries
        .catch(() => "")
        .finally(() => descriptionRequests.delete(node.id));
      descriptionRequests.set(node.id, request);
    }
    void request.then((text) => {
      if (active) setDescription(text);
      return text;
    });
    return () => {
      active = false;
    };
  }, [html, node.id, node.projectId, data.workspaceSlug]);
  const person = node.ownerId ? data.personById.get(node.ownerId) : undefined;
  return (
    <div id={id} className="w-72 rounded-lg border-[0.5px] border-strong bg-surface-1 p-3 shadow-raised-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ItemKey node={node} area={data.areaById.get(node.areaId ?? "")} />
        <StatusPill node={node} />
      </div>
      <p className="mt-2 text-13 font-medium [overflow-wrap:anywhere] text-primary">{node.name}</p>
      <div className="mt-3 flex items-center gap-2 text-12 text-secondary">
        <PersonAvatar person={person} />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{person?.name ?? "No owner"}</span>
        <span className="shrink-0 tabular-nums">
          {data.hoursOf(node.id)} h{data.itemHours[node.id] === undefined && " (guess)"}
        </span>
      </div>
      {description === undefined ? (
        <div role="status" aria-label="Loading description" className="mt-3 space-y-1.5 motion-safe:animate-pulse">
          <div className="h-3 rounded-sm bg-layer-2" />
          <div className="h-3 w-4/5 rounded-sm bg-layer-2" />
        </div>
      ) : description ? (
        <p className="mt-3 line-clamp-2 text-12 [overflow-wrap:anywhere] text-tertiary">{description}</p>
      ) : null}
    </div>
  );
});

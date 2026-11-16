/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { SetURLSearchParams } from "react-router";
import { LOGICAL_OPERATOR } from "@plane/types";
import type { TWorkItemFilterExpression } from "@plane/types";

const CONDITION_KEY = /^[a-z_]+__[a-z_]+$/;

/** CCI: an and/or group of at least one valid child, a not of one, or a condition map of scalar values. */
function isValidExpressionData(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length === 0) return false;
  if (entries.length === 1) {
    const [key, child] = entries[0];
    if (key === LOGICAL_OPERATOR.AND || key === LOGICAL_OPERATOR.OR)
      return Array.isArray(child) && child.length > 0 && child.every(isValidExpressionData);
    if (key === LOGICAL_OPERATOR.NOT) return isValidExpressionData(child);
  }
  return entries.every(([key, v]) => CONDITION_KEY.test(key) && ["string", "number", "boolean"].includes(typeof v));
}

/** CCI: no filters is encoded too (`e30`), so a link to the unfiltered view stays unfiltered for whoever opens it. */
export function encodeFilterExpression(expr?: TWorkItemFilterExpression): string {
  const bytes = new TextEncoder().encode(JSON.stringify(expr ?? {}));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeFilterExpression(str: string | null): TWorkItemFilterExpression | undefined {
  if (!str || !/^[A-Za-z0-9_-]+$/.test(str)) return undefined;

  try {
    const binary = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const expr: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!expr || typeof expr !== "object" || Array.isArray(expr)) return undefined;
    if (Object.keys(expr).length > 0 && !isValidExpressionData(expr)) return undefined;
    return expr as TWorkItemFilterExpression;
  } catch {
    return undefined;
  }
}

export function writeFiltersToUrl(setSearchParams: SetURLSearchParams, expr?: TWorkItemFilterExpression) {
  const value = encodeFilterExpression(expr);
  if (new URLSearchParams(window.location.search).get("filters") === value) return;

  setSearchParams(
    () => {
      // CCI: router search params can be stale here, so preserve the current browser query.
      const next = new URLSearchParams(window.location.search);
      next.set("filters", value);
      return next;
    },
    { replace: true }
  );
}

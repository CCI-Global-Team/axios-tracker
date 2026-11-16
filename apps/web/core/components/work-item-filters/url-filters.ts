/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { SetURLSearchParams } from "react-router";
import type { TWorkItemFilterExpression } from "@plane/types";

export function encodeFilterExpression(expr?: TWorkItemFilterExpression): string | null {
  if (!expr || Object.keys(expr).length === 0) return null;

  const bytes = new TextEncoder().encode(JSON.stringify(expr));
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
      if (value === null) next.delete("filters");
      else next.set("filters", value);
      return next;
    },
    { replace: true }
  );
}

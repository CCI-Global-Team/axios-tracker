/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { isAxiosError } from "axios";

export function initiativeErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError(error)) return fallback;
  if (error.response?.status === 403) return "You do not have permission to access initiatives.";
  if (error.response?.status === 404) return "This initiative or module is no longer available.";
  const data = error.response?.data;
  if (Array.isArray(data?.name)) return String(data.name[0]);
  if (Array.isArray(data?.module_ids)) return String(data.module_ids[0]);
  return typeof data?.error === "string" ? data.error : fallback;
}

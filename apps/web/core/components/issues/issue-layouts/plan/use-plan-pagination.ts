/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";

/** Attempt each cursor once; a failed page needs an explicit retry. */
export function usePlanPagination(args: {
  scope: string;
  cursor: string | undefined;
  hasMore: boolean;
  loading: boolean;
  fetchNext: () => Promise<unknown>;
}) {
  const { scope, cursor, hasMore, loading, fetchNext } = args;
  const attempted = useRef<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([scope, cursor, retry]);

  useEffect(() => {
    if (!hasMore || loading || attempted.current === key) return;
    attempted.current = key;
    void fetchNext().catch(() => setFailedKey(key));
  }, [hasMore, loading, key, fetchNext]);

  return { loadingError: failedKey === key, onRetryLoading: () => setRetry((value) => value + 1) };
}

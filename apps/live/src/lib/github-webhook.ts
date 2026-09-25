/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Whether `header` (X-Hub-Signature-256) is GitHub's HMAC-SHA256 of exactly these bytes. */
export function verifySignature(secret: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const given = Buffer.from(header);
  // timingSafeEqual throws on unequal lengths; a length mismatch is simply a wrong signature.
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

/** The serialization key, mirroring the Actions concurrency group
 *  `axios-<repo>-<pull_request.number || ref>`: one lane per PR, one per pushed ref. */
export function eventKey(event: { pull_request?: { number?: number }; ref?: string }, repo: string): string {
  const prNumber = event.pull_request?.number;
  return prNumber ? `${repo}#${prNumber}` : `${repo}@${event.ref ?? ""}`;
}

export type EnqueueResult = "started" | "queued" | "replaced";
type Task = () => Promise<unknown>;

/**
 * At most one task running and one pending per key; a newer task REPLACES the pending one, which
 * never runs. The same collapsing the Actions concurrency group gives (`cancel-in-progress: false`),
 * and safe for the same reason: the transition reads the PR's current state, so the survivor is
 * right about everything that happened while it waited.
 *
 * A task that has not settled after `timeoutMs` releases its key, so one hung request cannot stall
 * that PR's lane for the life of the process. It is not cancelled, only no longer waited for.
 */
export class KeyedQueue {
  private readonly running = new Set<string>();
  private readonly pending = new Map<string, Task>();

  constructor(
    private readonly onError: (key: string, error: unknown) => void,
    private readonly timeoutMs = 5 * 60_000
  ) {}

  enqueue(key: string, task: Task): EnqueueResult {
    if (!this.running.has(key)) {
      this.start(key, task);
      return "started";
    }
    const replaced = this.pending.has(key);
    this.pending.set(key, task);
    return replaced ? "replaced" : "queued";
  }

  /** Keys with a task running. */
  get active(): number {
    return this.running.size;
  }

  private start(key: string, task: Task): void {
    this.running.add(key);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
      timer.unref();
    });
    // Promise.resolve().then(task): a task that throws synchronously is caught like one that rejects.
    void Promise.race([Promise.resolve().then(task), timeout])
      .catch((error: unknown) => this.report(key, error))
      .finally(() => {
        clearTimeout(timer);
        const next = this.pending.get(key);
        this.pending.delete(key);
        if (next) this.start(key, next);
        else this.running.delete(key);
      });
  }

  private report(key: string, error: unknown): void {
    try {
      this.onError(key, error);
    } catch {
      // The error reporter failing must not take the lane down with it.
    }
  }
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eventKey, KeyedQueue, verifySignature } from "@/lib/github-webhook";

const sign = (secret: string, body: Buffer) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

/** A promise plus the function that settles it, so a test decides when a task finishes. */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setImmediate(r));

describe("verifySignature", () => {
  const body = Buffer.from('{"zen":"Keep it logically awesome."}');

  it("accepts GitHub's signature of the exact bytes", () => {
    expect(verifySignature("s3cret", body, sign("s3cret", body))).toBe(true);
  });

  it("rejects a missing, malformed, wrong-length or wrong-secret signature", () => {
    expect(verifySignature("s3cret", body, undefined)).toBe(false);
    expect(verifySignature("s3cret", body, "sha1=abc")).toBe(false);
    expect(verifySignature("s3cret", body, "sha256=abc")).toBe(false);
    expect(verifySignature("s3cret", body, sign("other", body))).toBe(false);
  });

  it("rejects a body that differs by one byte", () => {
    expect(verifySignature("s3cret", Buffer.from(`${body.toString()} `), sign("s3cret", body))).toBe(false);
  });
});

describe("eventKey", () => {
  it("keys PR and review events by PR number, pushes by ref", () => {
    expect(eventKey({ pull_request: { number: 7 }, ref: "refs/pull/7/merge" }, "o/r")).toBe("o/r#7");
    expect(eventKey({ ref: "refs/heads/feat/GAM-1" }, "o/r")).toBe("o/r@refs/heads/feat/GAM-1");
  });
});

describe("KeyedQueue", () => {
  it("runs one task per key at a time, keeps one pending, and a newer event replaces it", async () => {
    const queue = new KeyedQueue(() => {});
    const ran: string[] = [];
    const first = deferred();
    const task = (label: string, wait?: Promise<void>) => async () => {
      ran.push(label);
      await wait;
    };

    expect(queue.enqueue("o/r#1", task("a", first.promise))).toBe("started");
    expect(queue.enqueue("o/r#1", task("b"))).toBe("queued");
    expect(queue.enqueue("o/r#1", task("c"))).toBe("replaced");
    await flush();
    expect(ran).toEqual(["a"]);

    first.resolve();
    await flush();
    await flush();
    expect(ran).toEqual(["a", "c"]);
    expect(queue.active).toBe(0);
  });

  it("keeps separate keys independent", async () => {
    const queue = new KeyedQueue(() => {});
    const ran: string[] = [];
    const hold = deferred();
    queue.enqueue("o/r#1", async () => {
      ran.push("pr1");
      await hold.promise;
    });
    expect(queue.enqueue("o/r#2", async () => void ran.push("pr2"))).toBe("started");
    await flush();
    expect(ran).toEqual(["pr1", "pr2"]);
    hold.resolve();
  });

  it("reports a failing task and still runs the pending one", async () => {
    const errors: unknown[] = [];
    const queue = new KeyedQueue((_key, error) => errors.push(error));
    const ran: string[] = [];
    const fail = deferred();
    queue.enqueue("k", () => fail.promise);
    queue.enqueue("k", async () => void ran.push("next"));
    fail.reject(new Error("boom"));
    await flush();
    await flush();
    expect(errors).toHaveLength(1);
    expect(ran).toEqual(["next"]);
  });

  it("catches a task that throws synchronously, and an error reporter that throws", async () => {
    const queue = new KeyedQueue(() => {
      throw new Error("reporter broke");
    });
    queue.enqueue("k", () => {
      throw new Error("sync");
    });
    await flush();
    await flush();
    expect(queue.active).toBe(0);
  });

  it("releases a key whose task never settles", async () => {
    const errors: unknown[] = [];
    const queue = new KeyedQueue((_key, error) => errors.push(error), 10);
    queue.enqueue("k", () => new Promise(() => {}));
    await new Promise((r) => setTimeout(r, 30));
    expect(errors).toHaveLength(1);
    expect(queue.active).toBe(0);
  });
});

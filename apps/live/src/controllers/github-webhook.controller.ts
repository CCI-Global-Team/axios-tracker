/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * GitHub webhook receiver for the Axios work item transitions (GAM-316).
 *
 * Runs the same @plane/axios-transition module the Actions workflow runs, so the two cannot drift;
 * the webhook just saves the billed Actions minute per event. Ships dormant: without
 * GITHUB_WEBHOOK_SECRET every request gets 503 and nothing else happens.
 *
 * This process is the editor's realtime server, so the path is defensive throughout: the response
 * goes out before any Axios or GitHub request is made, and every failure is logged, never thrown.
 */

import type { Request, Response } from "express";
import { FatalError, handleEvent, shouldHandle } from "@plane/axios-transition";
import type { GitHubEvent } from "@plane/axios-transition";
import { Controller, Post } from "@plane/decorators";
import { logger } from "@plane/logger";
import { env } from "@/env";
import { eventKey, KeyedQueue, verifySignature } from "@/lib/github-webhook";

/** Under LIVE_BASE_PATH. server.ts reads the body raw on this path, for the signature. */
export const GITHUB_WEBHOOK_PATH = "/github/webhook";

const queue = new KeyedQueue((key, error) => {
  if (error instanceof FatalError) logger.error(`GITHUB_WEBHOOK: ${key}: ${error.message}`);
  else logger.error(`GITHUB_WEBHOOK: ${key}: transition errored`, error);
});

@Controller("/github")
export class GithubWebhookController {
  @Post("/webhook")
  receive(req: Request, res: Response) {
    try {
      const secret = env.GITHUB_WEBHOOK_SECRET;
      if (!secret) {
        res.status(503).json({ error: "github webhook not configured" });
        return;
      }

      const rawBody: unknown = req.body;
      const signature = req.header("x-hub-signature-256");
      if (!Buffer.isBuffer(rawBody) || !verifySignature(secret, rawBody, signature)) {
        res.status(401).json({ error: "invalid signature" });
        return;
      }

      const name = req.header("x-github-event") ?? "";
      const delivery = req.header("x-github-delivery") ?? "-";
      if (name === "ping") {
        res.status(200).json({ ok: true });
        return;
      }

      let event: GitHubEvent;
      try {
        event = JSON.parse(rawBody.toString("utf8")) as GitHubEvent;
      } catch {
        res.status(400).json({ error: "payload must be JSON (set the webhook content type to application/json)" });
        return;
      }

      if (!shouldHandle(name, event)) {
        res.status(202).json({ skipped: true });
        return;
      }

      const repo: unknown = event.repository?.full_name;
      if (typeof repo !== "string" || !repo) {
        res.status(400).json({ error: "payload has no repository.full_name" });
        return;
      }

      res.status(202).json({ accepted: true });

      const key = eventKey(event, repo);
      const log = (...args: unknown[]) =>
        logger.info(`GITHUB_WEBHOOK: [${delivery} ${name} ${key}] ${args.map(String).join(" ")}`);
      const result = queue.enqueue(key, () =>
        handleEvent(name, event, repo, {
          host: env.AXIOS_HOST,
          token: env.AXIOS_BOT_TOKEN,
          githubToken: env.AXIOS_GITHUB_TOKEN,
          log,
        })
      );
      if (result !== "started") log(`another event for ${key} is in flight - ${result}`);
    } catch (error) {
      logger.error("GITHUB_WEBHOOK: Unexpected failure", error);
      if (!res.headersSent) res.status(500).json({ error: "internal error" });
    }
  }
}

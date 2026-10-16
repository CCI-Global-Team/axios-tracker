/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * CCI: GAM-572. Gravity Forms webhook for the mobile-app support form (form 48): each entry becomes
 * a Pending item in the MOB project's Intake. Ships dormant: without SUPPORT_FORM_SECRET every
 * request gets 503 and nothing else happens. The work lives in @/lib/support-form.
 */

import type { Request, Response } from "express";
import { Controller, Post } from "@plane/decorators";
import { logger } from "@plane/logger";
import { env } from "@/env";
import { handleSupportForm } from "@/lib/support-form";

@Controller("/hooks")
export class SupportFormController {
  @Post("/support-form")
  async receive(req: Request, res: Response) {
    try {
      const result = await handleSupportForm(
        { secretHeader: req.header("x-axios-hook-secret"), body: req.body as unknown },
        {
          secret: env.SUPPORT_FORM_SECRET,
          projectId: env.SUPPORT_FORM_PROJECT_ID,
          token: env.AXIOS_BOT_TOKEN,
          host: env.AXIOS_HOST,
          workspace: env.AXIOS_WORKSPACE,
        },
        { log: (line) => logger.info(line) }
      );
      res.status(result.status).json(result.body);
    } catch (error) {
      logger.error("SUPPORT_FORM: Unexpected failure", error);
      if (!res.headersSent) res.status(500).json({ error: "internal error" });
    }
  }
}

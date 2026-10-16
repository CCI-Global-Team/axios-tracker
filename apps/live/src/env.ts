/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

// Environment variable validation
const envSchema = z.object({
  APP_VERSION: z.string().default("1.0.0"),
  HOSTNAME: z.string().optional(),
  PORT: z.string().default("3000"),
  API_BASE_URL: z.string().url("API_BASE_URL must be a valid URL"),
  // CORS configuration
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  // Live running location
  LIVE_BASE_PATH: z.string().default("/live"),
  // Compression options
  COMPRESSION_LEVEL: z.string().default("6").transform(Number),
  COMPRESSION_THRESHOLD: z.string().default("5000").transform(Number),
  // secret
  LIVE_SERVER_SECRET_KEY: z.string(),
  // Redis configuration
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.string().default("6379").transform(Number),
  REDIS_URL: z.string().optional(),
  // GitHub webhook -> Axios work item transitions (GAM-316). Without the secret the endpoint
  // answers 503 and does nothing.
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  AXIOS_HOST: z.string().default("https://axios.joincci.org"),
  AXIOS_BOT_TOKEN: z.string().optional(),
  AXIOS_GITHUB_TOKEN: z.string().optional(),
  // The Axios automation GitHub App, so links are posted by the app rather than by a person.
  // The key is a PEM, which does not survive an env file intact - base64 it. With either of these
  // unset the receiver falls back to AXIOS_GITHUB_TOKEN.
  AXIOS_GITHUB_APP_ID: z.string().optional(),
  AXIOS_GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  // CCI: GAM-400. Comma list of branches whose pushes ship work items; unset means "production".
  AXIOS_RELEASE_BRANCHES: z.string().optional(),
  // CCI: GAM-572. Gravity Forms support form (form 48) -> MOB Intake, at POST /hooks/support-form.
  // Gravity Forms cannot sign bodies, so callers send this value in X-Axios-Hook-Secret. Without
  // it the endpoint answers 503 and does nothing; without the project id it answers 503 too.
  SUPPORT_FORM_SECRET: z.string().optional(),
  // The MOB project's UUID; its Intake receives the items. Posted as AXIOS_BOT_TOKEN.
  SUPPORT_FORM_PROJECT_ID: z.string().optional(),
  // Workspace slug for Axios API calls.
  AXIOS_WORKSPACE: z.string().default("cci"),
});

const validateEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:", JSON.stringify(result.error.format(), null, 4));
    process.exit(1);
  }
  return result.data;
};

export const env = validateEnv();

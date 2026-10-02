/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Installation access tokens for the Axios automation GitHub App (GAM-399).
 *
 * The webhook receiver used to authenticate with a personal access token, so every work item link
 * it posted on a pull request looked like it came from that person. An app has its own identity:
 * the same comment arrives from axios-automation[bot], and the credential on the box can be
 * revoked without touching anybody's account.
 *
 * Tokens last an hour and are minted per installation, so they are cached and re-minted a little
 * before they expire. The installation is looked up from the repository rather than configured,
 * because the id changes if the app is ever reinstalled and a stale one fails every request.
 *
 * Signing is done with node:crypto - a JWT is a base64url header, a base64url payload and an
 * RS256 signature over the two, which is not worth a dependency.
 */

import { createSign } from "node:crypto";
import { logger } from "@plane/logger";
import { env } from "@/env";

/** Re-mint this long before expiry, so a token never expires mid-request. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

/** GitHub rejects a JWT that lives longer than 10 minutes. */
const JWT_LIFETIME_SECONDS = 9 * 60;

type CachedToken = {
  token: string;
  expiresAt: number;
};

const tokenByOwner = new Map<string, CachedToken>();
const installationIdByOwner = new Map<string, number>();

const base64url = (input: Buffer | string): string =>
  (Buffer.isBuffer(input) ? input : Buffer.from(input)).toString("base64url");

/**
 * Reads the configured private key, accepting either PEM or base64-encoded PEM.
 *
 * A PEM is multi-line and an env file is not, so the practical way to carry one is base64. Raw PEM
 * is accepted too for anyone who manages to pass the newlines through.
 */
const readPrivateKey = (): string | undefined => {
  const configured = env.AXIOS_GITHUB_APP_PRIVATE_KEY;
  if (!configured) return undefined;

  if (configured.includes("-----BEGIN")) return configured.replace(/\\n/g, "\n");

  const decoded = Buffer.from(configured, "base64").toString("utf8");
  return decoded.includes("-----BEGIN") ? decoded : undefined;
};

/** A short-lived JWT signed by the app's private key, used only to ask for installation tokens. */
const createAppJwt = (appId: string, privateKey: string): string => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // Backdated by a minute so a slightly fast clock on this box does not read as a future token.
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + JWT_LIFETIME_SECONDS, iss: appId }));

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();

  return `${header}.${payload}.${base64url(signer.sign(privateKey))}`;
};

const githubRequest = async (url: string, jwt: string, method: "GET" | "POST"): Promise<unknown> => {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`${method} ${url} responded ${response.status}`);
  }

  return response.json();
};

const getInstallationId = async (owner: string, jwt: string): Promise<number> => {
  const cached = installationIdByOwner.get(owner);
  if (cached) return cached;

  const body = (await githubRequest(`https://api.github.com/orgs/${owner}/installation`, jwt, "GET")) as {
    id?: number;
  };
  if (typeof body.id !== "number") throw new Error(`no installation for ${owner}`);

  installationIdByOwner.set(owner, body.id);
  return body.id;
};

/**
 * Returns a token to act as the app on a repository, or undefined when the app is not configured.
 *
 * Undefined is a normal answer, not a failure: it means fall back to whatever token is configured.
 * @param repo - The repository the event came from, as "owner/name".
 */
export const getAppInstallationToken = async (repo: string): Promise<string | undefined> => {
  const appId = env.AXIOS_GITHUB_APP_ID;
  const privateKey = readPrivateKey();
  if (!appId || !privateKey) return undefined;

  const owner = repo.split("/")[0];
  if (!owner) return undefined;

  const cached = tokenByOwner.get(owner);
  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return cached.token;

  try {
    const jwt = createAppJwt(appId, privateKey);
    const installationId = await getInstallationId(owner, jwt);
    const body = (await githubRequest(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      jwt,
      "POST"
    )) as { token?: string; expires_at?: string };

    if (!body.token || !body.expires_at) throw new Error("installation token response had no token");

    tokenByOwner.set(owner, { token: body.token, expiresAt: Date.parse(body.expires_at) });
    return body.token;
  } catch (error) {
    // The installation can be removed or the key rotated out from under us. Say so once and let
    // the caller fall back rather than dropping the event.
    logger.error(`GITHUB_APP: could not mint an installation token for ${owner}`, error);
    installationIdByOwner.delete(owner);
    return undefined;
  }
};

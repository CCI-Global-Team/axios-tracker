/**
 * The GitHub Actions entry: handle the event in GITHUB_EVENT_PATH, with config from the environment.
 * .github/scripts/axios-transition.mjs runs this, from a checkout with no install.
 */

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { FatalError, handleEvent } from "./index.mjs";

export async function main() {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  await handleEvent(process.env.GITHUB_EVENT_NAME, event, process.env.GITHUB_REPOSITORY);
}

/** Run main() the way the workflow expects: a red X only for a FatalError. */
export function run() {
  return main().catch((e) => {
    if (e instanceof FatalError) {
      console.error(`::error::${e.message}`);
      process.exit(1);
    }
    // Deliberately not a failure: see NEVER FAILS THE BUILD in index.mjs.
    console.log(`::warning::axios transition errored: ${e.message}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();

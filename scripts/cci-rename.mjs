/**
 * CCI vocabulary pass: "Cycle" -> "Sprint" in the English locale VALUES only.
 *
 * Why a script and not a hand edit: upstream ships new strings every release, so this must be
 * re-runnable after each rebase (see docs/UPGRADE.md step 4). It is idempotent.
 *
 * Scope rules:
 *   - Rewrites string VALUES only. Object keys, API routes, DB tables and code identifiers keep
 *     upstream's `cycle` nouns — renaming those would break the API and every future merge.
 *   - English only. Other locales keep upstream wording.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const LOCALE_DIR = "packages/i18n/src/locales/en";

// Order matters: plural forms must be replaced before singular ones.
const REPLACEMENTS = [
  [/\bCycles\b/g, "Sprints"],
  [/\bCycle\b/g, "Sprint"],
  [/\bcycles\b/g, "sprints"],
  [/\bcycle\b/g, "sprint"],
];

const rewriteValues = (node) => {
  let count = 0;
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (typeof value === "string") {
      let next = value;
      for (const [pattern, replacement] of REPLACEMENTS) next = next.replace(pattern, replacement);
      if (next !== value) {
        node[key] = next;
        count += 1;
      }
    } else if (value && typeof value === "object") {
      count += rewriteValues(value);
    }
  }
  return count;
};

let filesChanged = 0;
let stringsChanged = 0;

for (const file of readdirSync(LOCALE_DIR).filter((f) => f.endsWith(".json"))) {
  const path = join(LOCALE_DIR, file);
  const before = readFileSync(path, "utf8");
  const parsed = JSON.parse(before);
  stringsChanged += rewriteValues(parsed);
  const after = `${JSON.stringify(parsed, null, 2)}\n`;
  if (after !== before) {
    writeFileSync(path, after);
    filesChanged += 1;
  }
}

console.log(`cci-rename: ${filesChanged} file(s) updated, ${stringsChanged} string(s) changed`);

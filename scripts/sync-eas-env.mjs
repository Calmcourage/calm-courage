/**
 * Pushes EXPO_PUBLIC_* values from .env into EAS environment variables.
 *
 * EXPO_PUBLIC_* values are inlined at build time. Because .env is gitignored,
 * EAS never sees it, so a cloud build without these variables produces an app
 * that cannot reach Firebase. Run this once per environment after changing .env.
 *
 * Prerequisites:
 *   npx eas-cli login
 *   npx eas-cli init      (links the project, writes extra.eas.projectId)
 *
 * Run from repo root:
 *   npm run eas:env:sync              # syncs development, preview, production
 *   npm run eas:env:sync -- preview   # syncs a single environment
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const ALL_ENVIRONMENTS = ["development", "preview", "production"];

/**
 * Bundle ids are declared per build profile in eas.json. Purchase enable flags
 * are deliberately excluded so local testing cannot enable production billing.
 * Enable them deliberately in the intended environment after backend setup.
 */
const SKIPPED_KEYS = new Set([
  "EXPO_PUBLIC_IOS_BUNDLE_ID",
  "EXPO_PUBLIC_ANDROID_PACKAGE",
  "EXPO_PUBLIC_ENABLE_QA_PURCHASE",
  "EXPO_PUBLIC_ENABLE_STORE_PURCHASES",
]);

function parseEnvFile(filePath) {
  const contents = fs.readFileSync(filePath, "utf8");
  const values = new Map();

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    if (key.startsWith("EXPO_PUBLIC_") && value && !SKIPPED_KEYS.has(key)) {
      values.set(key, value);
    }
  }

  return values;
}

function pushVariable(key, value, environment) {
  execFileSync(
    "npx",
    [
      "eas-cli",
      "env:create",
      "--name",
      key,
      "--value",
      value,
      "--environment",
      environment,
      "--visibility",
      "plaintext",
      "--scope",
      "project",
      "--force",
      "--non-interactive",
    ],
    { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" },
  );
}

function main() {
  const envPath = path.join(repoRoot, ".env");

  if (!fs.existsSync(envPath)) {
    console.error("No .env found. Copy .env.example to .env first.");
    process.exit(1);
  }

  const values = parseEnvFile(envPath);

  if (values.size === 0) {
    console.error("No EXPO_PUBLIC_* values with content found in .env.");
    process.exit(1);
  }

  const requested = process.argv.slice(2);
  const environments =
    requested.length > 0 ? requested : ALL_ENVIRONMENTS;

  for (const environment of environments) {
    if (!ALL_ENVIRONMENTS.includes(environment)) {
      console.error(
        `Unknown environment "${environment}". Expected one of: ${ALL_ENVIRONMENTS.join(", ")}`,
      );
      process.exit(1);
    }
  }

  for (const environment of environments) {
    console.log(`\nSyncing ${values.size} variables to ${environment}...`);

    for (const [key, value] of values) {
      pushVariable(key, value, environment);
    }
  }

  console.log("\nDone. Verify with: npx eas-cli env:list");
}

main();

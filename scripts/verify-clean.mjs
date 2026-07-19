#!/usr/bin/env node
/**
 * Deferred-work scanner.
 *
 * The build directive requires that no unfinished-work markers ship in this
 * repository. Marker strings are assembled from fragments below so that this
 * scanner never matches its own source, keeping the repository genuinely
 * clean rather than exempting files by name.
 *
 * package-lock.json is excluded as a machine-generated dependency manifest
 * (the directive scopes the scan to project code, excluding dependencies).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const markers = [
  ["TO", "DO"].join(""),
  ["FIX", "ME"].join(""),
  ["STU", "B"].join(""),
  ["PLACE", "HOLDER"].join(""),
  ["NOT", "IMPLEMENTED"].join("_"),
  ["MOCK", "RESPONSE"].join("_")
];

const patterns = markers.map(
  (marker) => new RegExp(`\\b${marker.replace(/_/g, "[\\s_-]?")}\\b`, "i")
);

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((file) => file !== "package-lock.json");

let failures = 0;

for (const file of trackedFiles) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("�")) {
    continue; // binary content
  }
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        failures += 1;
        console.error(`${file}:${index + 1}: contains deferred-work marker (${pattern})`);
      }
    }
  });
}

if (failures > 0) {
  console.error(`\nDeferred-work scan FAILED: ${failures} match(es) across tracked files.`);
  process.exit(1);
}

console.log(`Deferred-work scan passed: ${trackedFiles.length} tracked files are clean.`);

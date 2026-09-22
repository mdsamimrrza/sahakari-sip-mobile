// ============================================================
// SahakariSIP — release version bump
// ============================================================
// Usage:  node scripts/bump-version.mjs [patch|minor|major]
//   patch (default): 1.0.1 -> 1.0.2
//   minor:           1.0.1 -> 1.1.0
//   major:           1.0.1 -> 2.0.0
//
// Bumps the version everywhere it lives (app.json, android
// versionName/versionCode), commits "chore: release vX.Y.Z", and
// creates the git tag. The tag push triggers the release workflow,
// which builds the APK and publishes the GitHub release with notes.
// Never pushes on its own — review, then `git push && git push --tags`.
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const kind = (process.argv[2] || "patch").toLowerCase();
if (!["patch", "minor", "major"].includes(kind)) {
  console.error(`Unknown bump kind "${kind}" — use patch, minor or major.`);
  process.exit(1);
}

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function bump(version) {
  const [ma, mi, pa] = version.split(".").map(Number);
  if ([ma, mi, pa].some(Number.isNaN)) throw new Error(`Bad version "${version}"`);
  if (kind === "major") return `${ma + 1}.0.0`;
  if (kind === "minor") return `${ma}.${mi + 1}.0`;
  return `${ma}.${mi}.${pa + 1}`;
}

// Work only from a clean tree so the release commit is exactly the bump.
const dirty = sh("git status --porcelain");
if (dirty) {
  console.error("Working tree is not clean — commit or stash first.\n" + dirty);
  process.exit(1);
}

// 1. app.json (Expo layout: version lives under "expo")
const appJsonPath = new URL("../app.json", import.meta.url);
const appJson = JSON.parse(readFileSync(appJsonPath, "utf8"));
const current = appJson.expo.version;
const next = bump(current);

appJson.expo.version = next;
writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + "\n");

// 2. android/app/build.gradle — versionName "x.y.z", versionCode n
const gradlePath = new URL("../android/app/build.gradle", import.meta.url);
const gradle = readFileSync(gradlePath, "utf8");
const versionNameRe = /versionName "([^"]+)"/;
const versionCodeRe = /versionCode (\d+)/;
const codeMatch = gradle.match(versionCodeRe);
if (!versionNameRe.test(gradle) || !codeMatch) {
  throw new Error("versionName/versionCode not found in android/app/build.gradle");
}
const nextCode = Number(codeMatch[1]) + 1;
writeFileSync(
  gradlePath,
  gradle
    .replace(versionNameRe, `versionName "${next}"`)
    .replace(versionCodeRe, `versionCode ${nextCode}`)
);

// 3. Commit + tag
sh(`git add app.json android/app/build.gradle`);
sh(`git commit -m "chore: release v${next}"`);
sh(`git tag -a v${next} -m "SahakariSIP Mobile v${next}"`);

console.log(`Released v${current} -> v${next} (versionCode ${codeMatch[1]} -> ${nextCode})`);
console.log(`Tagged v${next} locally.`);
console.log(`When ready:  git push && git push --tags   # push triggers the APK build + GitHub release`);

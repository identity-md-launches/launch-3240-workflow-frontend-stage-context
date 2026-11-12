import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = path.resolve(new URL("../..", import.meta.url).pathname);
process.chdir(root);
const handoff = JSON.parse(fs.readFileSync("web/handoff.json"));
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
const target = "docs/validation/delivery.json";
if (!fs.existsSync(target)) fs.writeFileSync(target, "{}\n");
const paths = [
  ...new Set([
    ...git("diff", "--name-only", handoff.sourceCommit),
    ...git("ls-files", "--others", "--exclude-standard"),
  ]),
]
  .filter((p) => !p.startsWith("test/scratch/"))
  .sort();
for (const p of paths) {
  if (!/^(web|dist|docs)\//.test(p))
    throw Error("Outside assigned scope: " + p);
  if (p.split("/").some((x) => x.startsWith(".")) && p !== "web/.gitignore")
    throw Error("Unbudgeted dotfile: " + p);
  if (/(^|\/)(node_modules|\.npm|\.cache|vendor)(\/|$)|\.tgz$/.test(p))
    throw Error("Unnecessary dependency artifact: " + p);
  if (fs.lstatSync(p).isSymbolicLink()) throw Error("Unexpected symlink: " + p);
}
if (git("ls-files", "-s").some((x) => x.startsWith("160000 ")))
  throw Error("Submodule found");
const manifest = JSON.parse(fs.readFileSync("dist/imd-deployment.json"));
for (const a of manifest.assets) {
  const hash = createHash("sha256")
    .update(fs.readFileSync("dist/" + a.path))
    .digest("hex");
  if (hash !== a.sha256) throw Error("Asset mismatch " + a.path);
}
const result = {
  checkedAt: new Date().toISOString(),
  sourceCommit: handoff.sourceCommit,
  changedFiles: paths.length,
  uncompressedChangedFileBytes: 0,
  submissionLimitBytes: 8388608,
  exportedAssets: manifest.assets.length,
  exportBytesIncludingManifest:
    fs.statSync("dist/imd-deployment.json").size +
    manifest.assets.reduce((n, a) => n + fs.statSync("dist/" + a.path).size, 0),
  allowedPathsOnly: true,
  noDependencyArtifacts: true,
  noSubmodules: true,
  allAssetHashesMatch: true,
  explicitIgnoreFileBudget: "web/.gitignore",
};
for (let i = 0; i < 5; i++) {
  result.uncompressedChangedFileBytes = paths.reduce(
    (n, p) => n + fs.statSync(p).size,
    0,
  );
  if (result.uncompressedChangedFileBytes > result.submissionLimitBytes)
    throw Error("Submission exceeds 8 MiB");
  fs.writeFileSync(target, JSON.stringify(result, null, 2) + "\n");
}
console.log(result);

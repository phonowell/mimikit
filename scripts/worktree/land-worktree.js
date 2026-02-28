#!/usr/bin/env node
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
  detectConflictState,
  ensureClean,
  parseWorktrees,
  runGit,
  runGitCapture,
  runGitFast,
} from "./git-utils.js";

const ALLOWED_BRANCHES = new Set(["worktree-1", "worktree-2", "worktree-3"]);

const exitWith = (message) => {
  console.error(message);
  process.exit(1);
};

const parseArgs = (argv) => {
  const options = { base: "main", plansDir: "plans" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      const scriptPath = process.argv[1] ?? "land-worktree.js";
      console.log(`Usage: node ${scriptPath} [--base <branch>] [--plans-dir <dir>]`);
      process.exit(0);
    }
    if (arg === "--base") {
      const value = argv[i + 1];
      if (!value) exitWith("missing value for --base");
      options.base = value;
      i += 1;
      continue;
    }
    if (arg === "--plans-dir") {
      const value = argv[i + 1];
      if (!value) exitWith("missing value for --plans-dir");
      options.plansDir = value;
      i += 1;
      continue;
    }
    exitWith(`unknown arg: ${arg}`);
  }
  return options;
};

const ensureNoInProgressState = (cwd) => {
  const state = detectConflictState(cwd);
  if (state.inMerge) exitWith("merge in progress: resolve or abort first");
  if (state.inRebase) exitWith("rebase in progress: resolve or abort first");
  if (state.conflicts) exitWith("conflicts detected: resolve first");
};

const clearPlansDirectory = (repoRoot, plansDirName) => {
  const plansDir = join(repoRoot, plansDirName);
  if (!existsSync(plansDir)) return;

  const entries = readdirSync(plansDir);
  for (const entry of entries) {
    rmSync(join(plansDir, entry), { force: true, recursive: true });
  }

  if (entries.length > 0) {
    console.log(`[land] cleared ${plansDirName}/: ${entries.length} item(s)`);
  }
};

const { base, plansDir } = parseArgs(process.argv.slice(2));
const repoRoot = runGitCapture(["rev-parse", "--show-toplevel"]);
const currentBranch = runGitCapture(["rev-parse", "--abbrev-ref", "HEAD"]);

if (currentBranch === "HEAD") exitWith("detached HEAD is not supported");
if (currentBranch === base) exitWith(`run from a non-${base} branch`);
if (!ALLOWED_BRANCHES.has(currentBranch)) exitWith("run from worktree-1/2/3 only");

ensureNoInProgressState();
clearPlansDirectory(repoRoot, plansDir);

const status = runGitCapture(["status", "--porcelain"]);
if (status.length > 0) {
  const today = new Date().toISOString().slice(0, 10);
  runGit(["add", "-A"]);
  runGit(["commit", "-m", `auto: ${currentBranch} ${today}`]);
}

ensureClean(process.cwd(), currentBranch);

const worktrees = parseWorktrees(runGitCapture(["worktree", "list", "--porcelain"]));
const mainWorktree = worktrees.find((wt) => wt.branch === `refs/heads/${base}`);
if (!mainWorktree) exitWith(`${base} worktree not found`);

const mainStatus = runGitCapture(["status", "--porcelain"], mainWorktree.path);
if (mainStatus.length > 0) exitWith(`${base} worktree is not clean`);

runGitFast({
  args: ["fetch", "--prune"],
  cwd: mainWorktree.path,
  context: `fetch origin (${base})`,
  tag: "land",
});
runGitFast({
  args: ["merge", "--ff-only", `origin/${base}`],
  cwd: mainWorktree.path,
  context: `ff merge origin/${base}`,
  tag: "land",
});
runGitFast({
  args: ["rebase", base],
  context: `rebase ${base} (${currentBranch})`,
  tag: "land",
});

const pendingMerge = runGitCapture(
  ["diff", "--name-only", `HEAD...${currentBranch}`],
  mainWorktree.path,
);
if (pendingMerge.length === 0) {
  console.log(`[land] no changes to land from ${currentBranch}`);
  process.exit(0);
}

runGitFast({
  args: ["merge", "--squash", currentBranch],
  cwd: mainWorktree.path,
  context: "squash merge branch",
  tag: "land",
});

const lastSubject = runGitCapture(
  ["log", "-1", "--pretty=%s", currentBranch],
  mainWorktree.path,
);
const landMessage =
  lastSubject.length > 0
    ? `land(${currentBranch}): ${lastSubject}`
    : `land(${currentBranch})`;
runGit(["commit", "-m", landMessage], mainWorktree.path);

runGitFast({
  args: ["reset", "--hard", base],
  context: `reset ${currentBranch} to ${base}`,
  tag: "land",
});

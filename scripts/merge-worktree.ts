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

const exitWith = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const parseArgs = (argv: string[]): void => {
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: tsx scripts/merge-worktree.ts");
      process.exit(0);
    }
    exitWith(`unknown arg: ${arg}`);
  }
};

const ensureNoInProgressState = (): void => {
  const state = detectConflictState();
  if (state.inMerge) exitWith("merge in progress: resolve or abort first");
  if (state.inRebase) exitWith("rebase in progress: resolve or abort first");
  if (state.conflicts) exitWith("conflicts detected: resolve first");
};

parseArgs(process.argv.slice(2));

const clearPlansDirectory = (repoRoot: string): void => {
  const plansDir = join(repoRoot, "plans");
  if (!existsSync(plansDir)) return;

  const entries = readdirSync(plansDir);
  for (const entry of entries) {
    rmSync(join(plansDir, entry), { force: true, recursive: true });
  }

  if (entries.length > 0) {
    console.log(`[merge] cleared plans/: ${entries.length} item(s)`);
  }
};

const repoRoot = runGitCapture(["rev-parse", "--show-toplevel"]);
const currentBranch = runGitCapture(["rev-parse", "--abbrev-ref", "HEAD"]);
if (currentBranch === "HEAD") exitWith("detached HEAD is not supported");
if (currentBranch === "main") exitWith("run from a non-main branch");
if (!ALLOWED_BRANCHES.has(currentBranch))
  exitWith("run from worktree-1/2/3 only");

ensureNoInProgressState();

clearPlansDirectory(repoRoot);

const status = runGitCapture(["status", "--porcelain"]);
if (status.length > 0) {
  const today = new Date().toISOString().slice(0, 10);
  runGit(["add", "-A"]);
  runGit(["commit", "-m", `auto: ${currentBranch} ${today}`]);
}

ensureClean(process.cwd(), currentBranch);

const worktrees = parseWorktrees(
  runGitCapture(["worktree", "list", "--porcelain"]),
);
const mainWorktree =
  worktrees.find((wt) => wt.branch === "refs/heads/main") ??
  exitWith("main worktree not found");

const mainStatus = runGitCapture(["status", "--porcelain"], mainWorktree.path);
if (mainStatus.length > 0) exitWith("main worktree is not clean");

runGitFast({
  args: ["fetch", "--prune"],
  cwd: mainWorktree.path,
  context: "fetch origin (main)",
  tag: "merge",
});
runGitFast({
  args: ["merge", "--ff-only", "origin/main"],
  cwd: mainWorktree.path,
  context: "ff merge origin/main",
  tag: "merge",
});

runGitFast({
  args: ["rebase", "main"],
  context: `rebase main (${currentBranch})`,
  tag: "merge",
});

const pendingMerge = runGitCapture(
  ["diff", "--name-only", `HEAD...${currentBranch}`],
  mainWorktree.path,
);
if (pendingMerge.length === 0) {
  console.log(`[merge] no changes to merge from ${currentBranch}`);
  process.exit(0);
}

runGitFast({
  args: ["merge", "--squash", currentBranch],
  cwd: mainWorktree.path,
  context: "squash merge branch",
  tag: "merge",
});

const lastSubject = runGitCapture(
  ["log", "-1", "--pretty=%s", currentBranch],
  mainWorktree.path,
);
const mergeMessage =
  lastSubject.length > 0
    ? `merge(${currentBranch}): ${lastSubject}`
    : `merge(${currentBranch})`;
runGit(["commit", "-m", mergeMessage], mainWorktree.path);

runGitFast({
  args: ["reset", "--hard", "main"],
  context: `reset ${currentBranch} to main`,
  tag: "merge",
});

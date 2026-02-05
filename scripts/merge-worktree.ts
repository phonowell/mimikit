import { existsSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import {
  detectConflictState,
  parseWorktrees,
  runGit,
  runGitCapture,
  runGitFast,
} from "./git-utils.js";

type Options = {
  cleanPlans: string[];
};

const ALLOWED_BRANCHES = new Set(["worktree-1", "worktree-2", "worktree-3"]);

const exitWith = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const parseArgs = (argv: string[]): Options => {
  const cleanPlans: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--clean-plans") {
      i += 1;
      const start = i;
      while (i < argv.length && !argv[i].startsWith("--")) {
        cleanPlans.push(argv[i]);
        i += 1;
      }
      if (cleanPlans.length === 0 || start === i) {
        exitWith("missing files after --clean-plans");
      }
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: tsx scripts/merge-worktree.ts [--clean-plans <file...>]");
      process.exit(0);
    }
    exitWith(`unknown arg: ${arg}`);
  }
  return { cleanPlans };
};

const ensureNoInProgressState = (): void => {
  const state = detectConflictState();
  if (state.inMerge) exitWith("merge in progress: resolve or abort first");
  if (state.inRebase) exitWith("rebase in progress: resolve or abort first");
  if (state.conflicts) exitWith("conflicts detected: resolve first");
};

const options = parseArgs(process.argv.slice(2));

const repoRoot = runGitCapture(["rev-parse", "--show-toplevel"]);
const currentBranch = runGitCapture(["rev-parse", "--abbrev-ref", "HEAD"]);
if (currentBranch === "HEAD") exitWith("detached HEAD is not supported");
if (currentBranch === "main") exitWith("run from a non-main branch");
if (!ALLOWED_BRANCHES.has(currentBranch))
  exitWith("run from worktree-1/2/3 only");

ensureNoInProgressState();

if (options.cleanPlans.length > 0) {
  const plansDir = join(repoRoot, "plans");
  for (const name of options.cleanPlans) {
    const target = resolve(plansDir, name);
    if (!target.startsWith(plansDir + sep)) {
      exitWith(`invalid plan path: ${name}`);
    }
    if (existsSync(target)) {
      rmSync(target);
      console.log(`removed ${target}`);
    }
  }
}

const status = runGitCapture(["status", "--porcelain"]);
if (status.length > 0) {
  const today = new Date().toISOString().slice(0, 10);
  runGit(["add", "-A"]);
  runGit(["commit", "-m", `auto: ${currentBranch} ${today}`]);
}

runGitFast({ args: ["fetch", "--prune"], context: "fetch origin", tag: "merge" });
runGitFast({
  args: ["rebase", "origin/main"],
  context: "rebase origin/main",
  tag: "merge",
});

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

const pendingMerge = runGitCapture(
  ["diff", "--name-only", `HEAD...${currentBranch}`],
  mainWorktree.path,
);
if (pendingMerge.length === 0) {
  console.log(`[merge] no changes to merge from ${currentBranch}`);
  runGitFast({
    args: ["rebase", "origin/main"],
    context: `sync slot ${currentBranch} to origin/main`,
    tag: "merge",
  });
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
  args: ["rebase", "origin/main"],
  context: `sync slot ${currentBranch} to origin/main`,
  tag: "merge",
});

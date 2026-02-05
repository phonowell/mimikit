import {
  detectConflictState,
  ensureClean,
  parseWorktrees,
  runGitCapture,
  runGitFast,
} from "./git-utils.js";

const ALLOWED_BRANCHES = new Set(["worktree-1", "worktree-2", "worktree-3"]);
const TARGET_BRANCHES = ["worktree-1", "worktree-2", "worktree-3"] as const;

const exitWith = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const ensureNoInProgressState = (cwd?: string): void => {
  const state = detectConflictState(cwd);
  if (state.inMerge) exitWith("merge in progress: resolve or abort first");
  if (state.inRebase) exitWith("rebase in progress: resolve or abort first");
  if (state.conflicts) exitWith("conflicts detected: resolve first");
};

const currentBranch = runGitCapture(["rev-parse", "--abbrev-ref", "HEAD"]);
if (currentBranch === "HEAD") exitWith("detached HEAD is not supported");
if (currentBranch === "main") exitWith("run from a non-main branch");
if (!ALLOWED_BRANCHES.has(currentBranch))
  exitWith("run from worktree-1/2/3 only");

ensureNoInProgressState();

const worktrees = parseWorktrees(
  runGitCapture(["worktree", "list", "--porcelain"]),
);

const worktreeMap = new Map<string, string>();
for (const wt of worktrees) {
  if (!wt.branch) continue;
  const match = wt.branch.match(/^refs\/heads\/(.+)$/);
  if (match) worktreeMap.set(match[1], wt.path);
}

for (const branch of TARGET_BRANCHES) {
  const path = worktreeMap.get(branch);
  if (!path) exitWith(`worktree not found for ${branch}`);
  ensureNoInProgressState(path);
  ensureClean(path, branch);
}

for (const branch of TARGET_BRANCHES) {
  const path = worktreeMap.get(branch);
  if (!path) continue;
  runGitFast({
    args: ["fetch", "--prune"],
    cwd: path,
    context: `fetch origin (${branch})`,
    tag: "sync",
  });
  runGitFast({
    args: ["rebase", "origin/main"],
    cwd: path,
    context: `rebase origin/main (${branch})`,
    tag: "sync",
  });
}

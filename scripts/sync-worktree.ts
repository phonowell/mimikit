import {
  detectConflictState,
  ensureClean,
  runGitCapture,
  runGitFast,
} from "./git-utils.js";

const ALLOWED_BRANCHES = new Set(["worktree-1", "worktree-2", "worktree-3"]);
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

ensureClean(process.cwd(), currentBranch);

runGitFast({
  args: ["fetch", "--prune"],
  context: `fetch origin (${currentBranch})`,
  tag: "sync",
});
runGitFast({
  args: ["rebase", "main"],
  context: `rebase main (${currentBranch})`,
  tag: "sync",
});

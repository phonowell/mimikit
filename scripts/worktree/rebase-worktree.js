#!/usr/bin/env node
import {
  detectConflictState,
  ensureClean,
  runGitCapture,
  runGitFast,
} from "./git-utils.js";

const ALLOWED_BRANCHES = new Set(["worktree-1", "worktree-2", "worktree-3"]);

const exitWith = (message) => {
  console.error(message);
  process.exit(1);
};

const ensureNoInProgressState = (cwd) => {
  const state = detectConflictState(cwd);
  if (state.inMerge) exitWith("merge in progress: resolve or abort first");
  if (state.inRebase) exitWith("rebase in progress: resolve or abort first");
  if (state.conflicts) exitWith("conflicts detected: resolve first");
};

const parseArgs = (argv) => {
  const options = { base: "main" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      const scriptPath = process.argv[1] ?? "rebase-worktree.js";
      console.log(`Usage: node ${scriptPath} [--base <branch>]`);
      process.exit(0);
    }
    if (arg === "--base") {
      const value = argv[i + 1];
      if (!value) exitWith("missing value for --base");
      options.base = value;
      i += 1;
      continue;
    }
    exitWith(`unknown arg: ${arg}`);
  }
  return options;
};

const { base } = parseArgs(process.argv.slice(2));
const currentBranch = runGitCapture(["rev-parse", "--abbrev-ref", "HEAD"]);
if (currentBranch === "HEAD") exitWith("detached HEAD is not supported");
if (currentBranch === base) exitWith(`run from a non-${base} branch`);
if (!ALLOWED_BRANCHES.has(currentBranch)) exitWith("run from worktree-1/2/3 only");

ensureNoInProgressState();
ensureClean(process.cwd(), currentBranch);

runGitFast({
  args: ["fetch", "--prune"],
  context: `fetch origin (${currentBranch})`,
  tag: "rebase",
});
runGitFast({
  args: ["rebase", base],
  context: `rebase ${base} (${currentBranch})`,
  tag: "rebase",
});

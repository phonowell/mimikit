import { execFileSync } from "node:child_process";

export type Worktree = {
  path: string;
  branch?: string;
  head?: string;
};

export type ConflictState = {
  inMerge: boolean;
  inRebase: boolean;
  conflicts: boolean;
};

export const runGitCapture = (args: string[], cwd?: string): string => {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
};

export const runGit = (args: string[], cwd?: string): void => {
  execFileSync("git", args, { cwd, stdio: "inherit" });
};

export const tryGitCapture = (args: string[], cwd?: string): string => {
  try {
    return runGitCapture(args, cwd);
  } catch {
    return "";
  }
};

export const detectConflictState = (cwd?: string): ConflictState => {
  const inMerge = Boolean(
    tryGitCapture(["rev-parse", "-q", "--verify", "MERGE_HEAD"], cwd),
  );
  const inRebase = Boolean(
    tryGitCapture(["rev-parse", "-q", "--verify", "REBASE_HEAD"], cwd),
  );
  const conflicts = Boolean(
    tryGitCapture(["diff", "--name-only", "--diff-filter=U"], cwd),
  );
  return { inMerge, inRebase, conflicts };
};

export const runGitFast = (params: {
  args: string[];
  cwd?: string;
  context: string;
  tag: string;
}): void => {
  try {
    runGit(params.args, params.cwd);
  } catch {
    const state = detectConflictState(params.cwd);
    if (state.conflicts) {
      console.error(`[${params.tag}] conflicts detected: ${params.context}`);
      console.error("Resolve conflicts (LLM if needed) and re-run.");
      process.exit(1);
    }
    if (state.inMerge || state.inRebase) {
      const phase = state.inMerge ? "merge" : "rebase";
      console.error(
        `[${params.tag}] ${phase} in progress after: ${params.context}`,
      );
      console.error("Resolve or abort, then re-run.");
      process.exit(1);
    }
    console.error(`[${params.tag}] command failed: ${params.context}`);
    process.exit(1);
  }
};

export const parseWorktrees = (text: string): Worktree[] => {
  const lines = text.split("\n").filter((line) => line.length > 0);
  const worktrees: Worktree[] = [];
  let current: Worktree | null = null;
  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      if (current) worktrees.push(current);
      current = { path: line.slice("worktree ".length) };
      continue;
    }
    if (line.startsWith("branch ")) {
      if (current) current.branch = line.slice("branch ".length);
      continue;
    }
    if (line.startsWith("HEAD ")) {
      if (current) current.head = line.slice("HEAD ".length);
      continue;
    }
  }
  if (current) worktrees.push(current);
  return worktrees;
};

export const ensureClean = (cwd: string, label: string): void => {
  const status = runGitCapture(["status", "--porcelain"], cwd);
  if (status.length > 0) {
    console.error(`${label} is not clean`);
    process.exit(1);
  }
};

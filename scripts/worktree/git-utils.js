#!/usr/bin/env node
import { execFileSync } from "node:child_process";

export const runGitCapture = (args, cwd) => {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
};

export const runGit = (args, cwd) => {
  execFileSync("git", args, { cwd, stdio: "inherit" });
};

export const tryGitCapture = (args, cwd) => {
  try {
    return runGitCapture(args, cwd);
  } catch {
    return "";
  }
};

export const detectConflictState = (cwd) => {
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

export const runGitFast = ({ args, cwd, context, tag }) => {
  try {
    runGit(args, cwd);
  } catch {
    const state = detectConflictState(cwd);
    if (state.conflicts) {
      console.error(`[${tag}] conflicts detected: ${context}`);
      console.error("Resolve conflicts and re-run.");
      process.exit(1);
    }
    if (state.inMerge || state.inRebase) {
      const phase = state.inMerge ? "merge" : "rebase";
      console.error(`[${tag}] ${phase} in progress after: ${context}`);
      console.error("Resolve or abort, then re-run.");
      process.exit(1);
    }
    console.error(`[${tag}] command failed: ${context}`);
    process.exit(1);
  }
};

export const parseWorktrees = (text) => {
  const lines = text.split("\n").filter((line) => line.length > 0);
  const worktrees = [];
  let current = null;
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

export const ensureClean = (cwd, label) => {
  const status = runGitCapture(["status", "--porcelain"], cwd);
  if (status.length > 0) {
    console.error(`${label} is not clean`);
    process.exit(1);
  }
};

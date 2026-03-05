#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseWorktrees, runGitCapture } from "./git-utils.js";

export const WORKTREE_SLOTS = ["worktree-1", "worktree-2", "worktree-3"];

const lockFileName = (slot) => `${slot}.lock.json`;

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const getRepoRoot = (cwd = process.cwd()) => {
  return runGitCapture(["rev-parse", "--show-toplevel"], cwd);
};

export const getGitCommonDir = (cwd = process.cwd()) => {
  return runGitCapture(["rev-parse", "--git-common-dir"], cwd);
};

export const getLockDir = (cwd = process.cwd()) => {
  const gitCommonDir = getGitCommonDir(cwd);
  return join(gitCommonDir, "worktree-slot-locks");
};

export const listSlots = (cwd = process.cwd()) => {
  const worktrees = parseWorktrees(runGitCapture(["worktree", "list", "--porcelain"], cwd));
  const byBranch = new Map();
  for (const item of worktrees) {
    if (!item.branch) continue;
    byBranch.set(item.branch, item.path);
  }

  return WORKTREE_SLOTS.map((slot) => {
    const branchRef = `refs/heads/${slot}`;
    return {
      slot,
      branchRef,
      path: byBranch.get(branchRef) ?? null,
    };
  });
};

export const readSlotLock = (slot, cwd = process.cwd()) => {
  const lockPath = join(getLockDir(cwd), lockFileName(slot));
  if (!existsSync(lockPath)) return null;

  const raw = readFileSync(lockPath, "utf8");
  const parsed = parseJson(raw);
  return parsed
    ? {
        lockPath,
        ...parsed,
      }
    : {
        lockPath,
        slot,
        ownerId: "runtime-unknown",
        createdAt: new Date(0).toISOString(),
      };
};

export const acquireSlotLock = ({ slot, ownerId, cwd = process.cwd(), metadata = {} }) => {
  const lockDir = getLockDir(cwd);
  mkdirSync(lockDir, { recursive: true });

  const lockPath = join(lockDir, lockFileName(slot));
  const existing = readSlotLock(slot, cwd);
  if (existing) {
    const holder = existing.ownerId ?? "runtime-unknown";
    throw new Error(`${slot} is occupied by ${holder}`);
  }

  const lockData = {
    slot,
    ownerId,
    pid: process.pid,
    createdAt: new Date().toISOString(),
    ...metadata,
  };
  writeFileSync(lockPath, `${JSON.stringify(lockData, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });

  return {
    lockPath,
    ...lockData,
  };
};

export const releaseSlotLock = ({ slot, cwd = process.cwd(), force = false }) => {
  const lockPath = join(getLockDir(cwd), lockFileName(slot));
  if (!existsSync(lockPath)) {
    if (force) return;
    throw new Error(`${slot} is not occupied`);
  }

  rmSync(lockPath, { force: true });
};

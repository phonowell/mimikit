#!/usr/bin/env node
import { execFileSync } from "node:child_process";

import {
  WORKTREE_SLOTS,
  acquireSlotLock,
  listSlots,
  readSlotLock,
  releaseSlotLock,
} from "./slot-state.js";

const exitWith = (message) => {
  console.error(message);
  process.exit(1);
};

const parseOptions = (argv) => {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") continue;
    if (!token.startsWith("--")) exitWith(`unknown arg: ${token}`);

    const key = token.slice(2).replaceAll("-", "_");
    if (key === "help" || key === "h") {
      options.help = true;
      continue;
    }
    if (key === "force") {
      options.force = true;
      continue;
    }

    const value = argv[i + 1];
    if (!value || value.startsWith("--")) exitWith(`missing value for --${key}`);
    options[key] = value;
    i += 1;
  }
  return options;
};

const runCommand = (args, cwd, label) => {
  execFileSync(args[0], args.slice(1), { cwd, stdio: "inherit" });
  console.log(`[wt-slot] ${label} done`);
};

const formatLockState = (slot) => {
  const lock = readSlotLock(slot.slot);
  if (!slot.path) return `${slot.slot}\tmissing\t-\t-`;
  if (!lock) return `${slot.slot}\tavailable\t-\t${slot.path}`;
  return `${slot.slot}\toccupied\t${lock.ownerId}\t${slot.path}`;
};

const pickSlot = (slots, requestedSlot) => {
  if (requestedSlot) {
    if (!WORKTREE_SLOTS.includes(requestedSlot)) {
      exitWith(`invalid slot: ${requestedSlot}`);
    }
    const fixed = slots.find((item) => item.slot === requestedSlot);
    if (!fixed?.path) exitWith(`${requestedSlot} worktree path not found`);
    return fixed;
  }

  for (const slot of slots) {
    if (!slot.path) continue;
    if (!readSlotLock(slot.slot)) return slot;
  }
  exitWith("no available worktree slot");
};

const startSlot = (options) => {
  const slots = listSlots();
  const selected = pickSlot(slots, options.slot);
  const ownerId = options.owner ?? `runtime-${process.pid}`;

  try {
    acquireSlotLock({
      slot: selected.slot,
      ownerId,
      metadata: {
        command: "start",
        requestedBy: process.cwd(),
      },
    });
  } catch (error) {
    exitWith(error instanceof Error ? error.message : "slot lock failed");
  }

  try {
    runCommand(["pnpm", "run", "wt-rebase"], selected.path, `wt-rebase (${selected.slot})`);
  } catch {
    releaseSlotLock({ slot: selected.slot, force: true });
    exitWith(`wt-rebase (${selected.slot}) failed and lock released`);
  }

  console.log(`slot=${selected.slot}`);
  console.log(`path=${selected.path}`);
  console.log(`owner=${ownerId}`);
};

const finishSlot = (options) => {
  const slot = options.slot;
  if (!slot) exitWith("--slot is required for finish");
  if (!options.message) exitWith("--message is required for finish");

  const slots = listSlots();
  const selected = slots.find((item) => item.slot === slot);
  if (!selected?.path) exitWith(`${slot} worktree path not found`);
  if (!readSlotLock(slot)) exitWith(`${slot} is not occupied`);

  const reviewCommand = options.review_cmd ?? "review-code-changes";
  try {
    runCommand(["pnpm", "run", reviewCommand], selected.path, `${reviewCommand} (${slot})`);
    runCommand(
      ["pnpm", "run", "wt-land", "--", "--message", options.message],
      selected.path,
      `wt-land (${slot})`,
    );
  } catch {
    exitWith(`finish failed on ${slot}; lock is kept for recovery`);
  }

  releaseSlotLock({ slot, force: true });
  console.log(`released=${slot}`);
};

const release = (options) => {
  const slot = options.slot;
  if (!slot) exitWith("--slot is required for release");
  releaseSlotLock({ slot, force: Boolean(options.force) });
  console.log(`released=${slot}`);
};

const status = () => {
  const slots = listSlots();
  console.log("slot\tstate\towner\tpath");
  for (const slot of slots) {
    console.log(formatLockState(slot));
  }
};

const command = process.argv[2];
const options = parseOptions(process.argv.slice(3));

if (options.help || !command) {
  console.log("Usage:");
  console.log("  node scripts/worktree/manage-slot.js start [--slot worktree-1|worktree-2|worktree-3] [--owner runtime-xxx]");
  console.log("  node scripts/worktree/manage-slot.js finish --slot worktree-x --message <text> [--review-cmd review-code-changes]");
  console.log("  node scripts/worktree/manage-slot.js release --slot worktree-x [--force]");
  console.log("  node scripts/worktree/manage-slot.js status");
  process.exit(0);
}

if (command === "start") {
  startSlot(options);
  process.exit(0);
}
if (command === "finish") {
  finishSlot(options);
  process.exit(0);
}
if (command === "release") {
  release(options);
  process.exit(0);
}
if (command === "status") {
  status();
  process.exit(0);
}

exitWith(`unknown command: ${command}`);

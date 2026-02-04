import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";

type Worktree = {
  path: string;
  branch?: string;
  head?: string;
};

type Options = {
  cleanPlans: string[];
};

const runGitCapture = (args: string[], cwd?: string): string => {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
};

const runGit = (args: string[], cwd?: string): void => {
  execFileSync("git", args, { cwd, stdio: "inherit" });
};

const tryGitCapture = (args: string[], cwd?: string): string => {
  try {
    return runGitCapture(args, cwd);
  } catch {
    return "";
  }
};

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
      console.log("Usage: tsx overflows/merge.ts [--clean-plans <file...>]");
      process.exit(0);
    }
    exitWith(`unknown arg: ${arg}`);
  }
  return { cleanPlans };
};

const ensureNoInProgressState = (): void => {
  if (tryGitCapture(["rev-parse", "-q", "--verify", "MERGE_HEAD"])) {
    exitWith("merge in progress: resolve or abort first");
  }
  if (tryGitCapture(["rev-parse", "-q", "--verify", "REBASE_HEAD"])) {
    exitWith("rebase in progress: resolve or abort first");
  }
  const conflicts = runGitCapture(["diff", "--name-only", "--diff-filter=U"]);
  if (conflicts.length > 0) {
    exitWith("conflicts detected: resolve first");
  }
};

const parseWorktrees = (text: string): Worktree[] => {
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

const options = parseArgs(process.argv.slice(2));

const repoRoot = runGitCapture(["rev-parse", "--show-toplevel"]);
const currentBranch = runGitCapture(["rev-parse", "--abbrev-ref", "HEAD"]);
if (currentBranch === "HEAD") exitWith("detached HEAD is not supported");
if (currentBranch === "main") exitWith("run from a non-main branch");

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

runGit(["fetch", "--prune"]);
runGit(["rebase", "origin/main"]);

const worktrees = parseWorktrees(runGitCapture(["worktree", "list", "--porcelain"]));
const mainWorktree = worktrees.find((wt) => wt.branch === "refs/heads/main");
if (!mainWorktree) exitWith("main worktree not found");

const mainStatus = runGitCapture(["status", "--porcelain"], mainWorktree.path);
if (mainStatus.length > 0) exitWith("main worktree is not clean");

runGit(["fetch", "--prune"], mainWorktree.path);
runGit(["merge", "--ff-only", "origin/main"], mainWorktree.path);
runGit(["merge", "--squash", currentBranch], mainWorktree.path);

const lastSubject = runGitCapture(["log", "-1", "--pretty=%s", currentBranch], mainWorktree.path);
const mergeMessage = lastSubject.length > 0 ? `merge(${currentBranch}): ${lastSubject}` : `merge(${currentBranch})`;
runGit(["commit", "-m", mergeMessage], mainWorktree.path);

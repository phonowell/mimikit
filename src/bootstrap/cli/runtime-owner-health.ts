import { spawnSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { createConnection } from 'node:net'

import {
  isPidAlive,
  killPidBestEffort,
} from '../../kernel/runtime/reaper-pid.js'
import { removeLeaseFileIfExists } from '../../kernel/runtime/reaper-registry.js'
import { buildPaths } from '../../persistence/fs/paths.js'

import type { ActiveRuntimeOwner } from './runtime-lock.js'

const TERM_WAIT_MS = 1_500
const KILL_WAIT_MS = 1_000
const PROBE_TIMEOUT_MS = 400
const CLI_ENTRY_HINT = '/src/bootstrap/cli/index.ts'

type PidInfo = {
  pid: number
  ppid: number
  command: string
}

type RuntimeOwnerHealthDeps = {
  isPidAlive: (pid: number) => boolean
  killPidBestEffort: typeof killPidBestEffort
  resolveControlPid: (ownerPid: number) => number | null
  resolveOwnerPort: (
    ownerPid: number,
    controlPid: number | null,
  ) => number | null
  isPortReachable: (port: number) => Promise<boolean>
  removeLockPath: (lockPath: string) => Promise<void>
  removeLeasePath: (workDir: string) => Promise<void>
}

const readPidInfo = (pid: number): PidInfo | null => {
  const result = spawnSync(
    'ps',
    ['-o', 'pid=,ppid=,command=', '-p', String(pid)],
    {
      encoding: 'utf8',
    },
  )
  if (result.status !== 0) return null
  const line = result.stdout.trim()
  if (!line) return null
  const match = line.match(/^(\d+)\s+(\d+)\s+([\s\S]+)$/)
  if (!match) return null
  const parsedPid = Number.parseInt(match[1] ?? '', 10)
  const parsedPpid = Number.parseInt(match[2] ?? '', 10)
  const command = (match[3] ?? '').trim()
  if (!Number.isInteger(parsedPid) || parsedPid <= 0) return null
  if (!Number.isInteger(parsedPpid) || parsedPpid < 0) return null
  if (!command) return null
  return {
    pid: parsedPid,
    ppid: parsedPpid,
    command,
  }
}

const resolveControlPid = (ownerPid: number): number | null => {
  let current = readPidInfo(ownerPid)
  if (!current) return null
  let controlPid = current.pid
  while (current.command.includes(CLI_ENTRY_HINT) && current.ppid > 1) {
    const parent = readPidInfo(current.ppid)
    if (!parent?.command.includes(CLI_ENTRY_HINT)) break
    controlPid = parent.pid
    current = parent
  }
  return controlPid
}

const parsePortFromCommand = (command: string): number | null => {
  const flagMatch = command.match(/(?:^|\s)--port(?:=|\s+)(\d{1,5})(?:\s|$)/)
  if (!flagMatch) return null
  const port = Number.parseInt(flagMatch[1] ?? '', 10)
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null
}

const resolveOwnerPort = (
  ownerPid: number,
  controlPid: number | null,
): number | null => {
  const ownerInfo = readPidInfo(ownerPid)
  const ownerPort = ownerInfo ? parsePortFromCommand(ownerInfo.command) : null
  if (ownerPort !== null) return ownerPort
  if (controlPid === null || controlPid === ownerPid) return null
  const controlInfo = readPidInfo(controlPid)
  return controlInfo ? parsePortFromCommand(controlInfo.command) : null
}

const isPortReachable = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = createConnection({
      host: '127.0.0.1',
      port,
    })
    const settle = (value: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(PROBE_TIMEOUT_MS)
    socket.once('connect', () => settle(true))
    socket.once('timeout', () => settle(false))
    socket.once('error', () => settle(false))
  })

const removeLockPath = async (lockPath: string): Promise<void> => {
  await rm(lockPath, { recursive: true, force: true }).catch(() => undefined)
}

const removeLeasePath = async (workDir: string): Promise<void> => {
  await removeLeaseFileIfExists(buildPaths(workDir).runtimeLease)
}

const defaultDeps: RuntimeOwnerHealthDeps = {
  isPidAlive,
  killPidBestEffort,
  resolveControlPid,
  resolveOwnerPort,
  isPortReachable,
  removeLockPath,
  removeLeasePath,
}

const buildRecoveryPidOrder = (
  ownerPid: number,
  controlPid: number | null,
): number[] => Array.from(new Set([controlPid ?? ownerPid, ownerPid]))

const stopPid = async (
  pid: number,
  deps: RuntimeOwnerHealthDeps,
): Promise<void> => {
  if (!deps.isPidAlive(pid)) return
  const exitedByTerm = await deps.killPidBestEffort({
    pid,
    signal: 'SIGTERM',
    waitMs: TERM_WAIT_MS,
  })
  if (exitedByTerm || !deps.isPidAlive(pid)) return
  await deps.killPidBestEffort({
    pid,
    signal: 'SIGKILL',
    waitMs: KILL_WAIT_MS,
  })
}

export const recoverUnhealthyRuntimeOwner = async (
  params: {
    workDir: string
    owner: ActiveRuntimeOwner
    port: number | null
  },
  deps: RuntimeOwnerHealthDeps = defaultDeps,
): Promise<boolean> => {
  const controlPid = deps.resolveControlPid(params.owner.ownerPid)
  const probePort =
    params.owner.port ??
    deps.resolveOwnerPort(params.owner.ownerPid, controlPid) ??
    params.port
  if (probePort === null) return false
  if (!deps.isPidAlive(params.owner.ownerPid)) return false
  if (await deps.isPortReachable(probePort)) return false

  const recoveryPids = buildRecoveryPidOrder(params.owner.ownerPid, controlPid)
  for (const pid of recoveryPids) await stopPid(pid, deps)

  if (recoveryPids.some((pid) => deps.isPidAlive(pid))) return false

  await deps.removeLeasePath(params.workDir)
  await deps.removeLockPath(params.owner.lockPath)
  return true
}

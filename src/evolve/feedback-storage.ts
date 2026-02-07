import { join, resolve } from 'node:path'

export const evolveDirPath = (stateDir: string): string =>
  resolve(join(stateDir, 'evolve'))

export const feedbackPath = (stateDir: string): string =>
  resolve(join(evolveDirPath(stateDir), 'feedback.jsonl'))

export const feedbackArchivePath = (stateDir: string): string =>
  resolve(join(evolveDirPath(stateDir), 'feedback-archive.md'))

export const feedbackStatePath = (stateDir: string): string =>
  resolve(join(evolveDirPath(stateDir), 'feedback-state.json'))

export const issueQueuePath = (stateDir: string): string =>
  resolve(join(evolveDirPath(stateDir), 'issue-queue.json'))

export const getFeedbackStoragePaths = (
  stateDir: string,
): {
  evolveDir: string
  feedback: string
  archive: string
  feedbackState: string
  issueQueue: string
} => ({
  evolveDir: evolveDirPath(stateDir),
  feedback: feedbackPath(stateDir),
  archive: feedbackArchivePath(stateDir),
  feedbackState: feedbackStatePath(stateDir),
  issueQueue: issueQueuePath(stateDir),
})

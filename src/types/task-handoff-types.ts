import type { TaskGitExecution } from './task-git-types.js'

export type TaskResultHandoffArtifact = {
  path: string
  kind?: string | undefined
  note?: string | undefined
}

export type TaskResultHandoffEvidence = {
  type: 'task_archive' | 'file' | 'history'
  ref: string
  note?: string | undefined
}

export type TaskResultHandoff = {
  goal?: string | undefined
  summary?: string | undefined
  decisions?: string[] | undefined
  nextSteps?: string[] | undefined
  risks?: string[] | undefined
  git?: TaskGitExecution | undefined
  artifacts?: TaskResultHandoffArtifact[] | undefined
  evidence?: TaskResultHandoffEvidence[] | undefined
}

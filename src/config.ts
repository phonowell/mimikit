import { resolve } from 'node:path'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type DefaultConfigParams = {
  /** 状态目录路径（用于持久化运行状态数据） */
  stateDir: string
  /** 工作目录路径（用于执行任务与读写项目文件） */
  workDir: string
}

export type AppConfig = {
  /** 状态目录绝对路径 */
  stateDir: string
  /** 工作目录绝对路径 */
  workDir: string
  /** 管理器调度配置 */
  manager: {
    /** 轮询间隔（毫秒） */
    pollMs: number
    /** 两次调度最小间隔（毫秒） */
    minIntervalMs: number
    /** 任务列表保留上限（条） */
    tasksMaxCount: number
    /** 任务列表保留下限（条） */
    tasksMinCount: number
    /** 任务列表保留上限（字节） */
    tasksMaxBytes: number
    /** 历史记录保留下限（条） */
    historyMinCount: number
    /** 历史记录保留上限（条） */
    historyMaxCount: number
    /** 历史记录保留上限（字节） */
    historyMaxBytes: number
    /** 默认执行模型 */
    model: string
    /** 默认推理强度 */
    modelReasoningEffort: ModelReasoningEffort
  }
  /** 自演进调度配置 */
  evolver: {
    /** 是否启用自演进循环 */
    enabled: boolean
    /** 轮询间隔（毫秒） */
    pollMs: number
    /** 空闲阈值（毫秒） */
    idleThresholdMs: number
    /** 两次执行最小间隔（毫秒） */
    minIntervalMs: number
  }
  /** Worker 执行配置 */
  worker: {
    /** 最大并发执行数 */
    maxConcurrent: number
    /** 失败重试最大次数 */
    retryMaxAttempts: number
    /** 重试退避时长（毫秒） */
    retryBackoffMs: number
    /** 标准任务配置 */
    standard: {
      /** 任务超时（毫秒） */
      timeoutMs: number
      /** 任务模型 */
      model: string
      /** 任务推理强度 */
      modelReasoningEffort: ModelReasoningEffort
    }
    /** 专家任务配置 */
    specialist: {
      /** 任务超时（毫秒） */
      timeoutMs: number
      /** 任务模型 */
      model: string
      /** 任务推理强度 */
      modelReasoningEffort: ModelReasoningEffort
    }
  }
}

export type OrchestratorConfig = AppConfig

export const defaultConfig = (params: DefaultConfigParams): AppConfig => ({
  stateDir: resolve(params.stateDir),
  workDir: resolve(params.workDir),
  manager: {
    pollMs: 1_000, // 1秒轮询一次
    minIntervalMs: 10_000, // 最小10秒调度间隔
    tasksMaxCount: 20, // 任务列表最多保留20条
    tasksMinCount: 5, // 任务列表最少保留5条
    tasksMaxBytes: 20 * 1024, // 任务列表最多保留20KB
    historyMinCount: 20, // 历史记录最少保留20条
    historyMaxCount: 100, // 历史记录最多保留100条
    historyMaxBytes: 20 * 1024, // 历史记录最多保留20KB
    model: 'gpt-5.2-high',
    modelReasoningEffort: 'high',
  },
  evolver: {
    enabled: false,
    pollMs: 2_000,
    idleThresholdMs: 60_000,
    minIntervalMs: 5 * 60 * 1_000,
  },
  worker: {
    maxConcurrent: 3, // 最大3个任务并发执行
    retryMaxAttempts: 1, // 失败重试1次
    retryBackoffMs: 5_000, // 重试退避5秒
    standard: {
      timeoutMs: 10 * 60 * 1_000, // 标准任务默认10分钟超时
      model: 'opencode/big-pickle',
      modelReasoningEffort: 'high',
    },
    specialist: {
      timeoutMs: 10 * 60 * 1_000, // 专家任务默认10分钟超时
      model: 'gpt-5.3-codex-high',
      modelReasoningEffort: 'high',
    },
  },
})

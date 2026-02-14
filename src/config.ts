import { resolve } from 'node:path'

import { loadDefaultConfigFromYaml } from './config-default-loader.js'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type DefaultConfigParams = {
  /** 工作目录路径（用于持久化状态、执行任务与读写文件） */
  workDir: string
}

export type AppConfig = {
  /** 工作目录绝对路径（也是状态目录） */
  workDir: string
  /** 管理器调度配置 */
  manager: {
    /** 轮询间隔（毫秒） */
    pollMs: number
    /** manager prompt 的硬 token 上限 */
    promptMaxTokens: number
    /** create_task 去抖时间窗（毫秒） */
    createTaskDebounceMs: number
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
    /** Manager profile 任务执行配置 */
    task: {
      /** 任务超时（毫秒） */
      timeoutMs: number
      /** 任务模型 */
      model: string
      /** 任务推理强度 */
      modelReasoningEffort: ModelReasoningEffort
    }
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
  workDir: resolve(params.workDir),
  ...loadDefaultConfigFromYaml(),
})

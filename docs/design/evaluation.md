# 回放评测设计（MVP）

> 返回 [系统设计总览](./README.md)

## 目标
- 离线回放 `runManager` 输入
- 用最小断言检查回归
- 输出机器可读 JSON + 人类可读 Markdown

## 入口与实现
- 入口：`scripts/replay-eval.ts`
- 类型：`src/eval/replay-types.ts`
- 加载：`src/eval/replay-loader.ts`
- 执行：`src/eval/replay-runner.ts`
- 报告：`src/eval/replay-report.ts`

## suite 协议
- 路径建议：`test/fixtures/replay/*.json`
- 根字段：`suite` `version` `cases[]`
- case 字段：`id` `history` `inputs` `tasks` `results` `expect`
- 可选重复执行：`repeat.count`（正整数）+ `repeat.idFormat`（支持 `{i}` 占位）
- `history/inputs/tasks/results` 直接映射 `runManager` 入参

### 多 suite bundle（防过拟合）
- 文件格式：`{"suites":[{"path":"...","weight":1,"alias":"..."}]}`
- `weight` 默认 `1`，用于聚合加权评分；`alias` 仅用于报告可读性
- 单轮自演进可通过 `--bundle <path>` 启用多 suite 聚合评测

## 断言类型
- 命令次数：`expect.commands.<action>.min|max`
- 输出必含：`expect.output.mustContain[]`
- 输出禁含：`expect.output.mustNotContain[]`

## 报告与产物
- JSON：`./.mimikit/generated/replay/*.json`
- Markdown：`./.mimikit/generated/replay/*.md`
- 报告字段：`suite/runAt/model/total/passed/failed/passRate/metrics/cases[]`
- `metrics`：`llmCalls/liveCases/archiveCases/llmElapsedMs/usage(input/output/total)`
- `cases[]` 增加：`source(live|archive)`、`llmElapsedMs`、`usage`

## 退出码
- `0`：全部通过
- `1`：存在断言失败
- `2`：样本格式错误或运行错误

## 最小样本
- 样本文件：`test/fixtures/replay/manager-core.json`

## 本地执行
- `pnpm replay:eval -- --suite test/fixtures/replay/manager-core.json --out .mimikit/generated/replay/last.json --md .mimikit/generated/replay/last.md`
- 指定模型：追加 `--model <name>`
- 透传采样参数：追加 `--seed <int>` `--temperature <num>`
- 离线只读归档：追加 `--offline`（归档 miss 直接报错，不触发在线请求）
- 归档优先（miss 才在线）：追加 `--prefer-archive`
- 指定归档目录：追加 `--archive-dir <path>`（默认 `<state-dir>/llm`）
- 快速失败：追加 `--max-fail 1`

## 自演进单轮
- 入口：`pnpm self:evolve -- --suite test/fixtures/replay/manager-core.json --out-dir .mimikit/generated/evolve/round1 --state-dir .mimikit/generated/evolve/state-round1`
- 多 suite 入口：`pnpm self:evolve -- --bundle test/fixtures/replay/suite-bundle-core.json --out-dir .mimikit/generated/evolve/multi --state-dir .mimikit/generated/evolve/state-multi`
- 闭环：基线评测 → 自动改写 `prompts/agents/manager/system.md` → 候选评测 → 自动判定是否回滚
- 判定优先级：`passRate` > `usage.total` > `llmElapsedMs`
- 防抖阈值（可选）：`--min-pass-rate-delta` `--min-token-delta` `--min-latency-delta-ms`
- 候选护栏：若缺失命令协议标记或长度异常（过短/过长），直接拒绝并回滚，避免无效评测消耗
- 产物：`decision.json` + `baseline.json` + `candidate.json`

## 自演进多轮循环
- 入口：`pnpm self:evolve:loop -- --suite test/fixtures/replay/manager-core.json --max-rounds 5 --out-dir .mimikit/generated/evolve-loop --state-dir .mimikit/generated/evolve-loop/state`
- 每轮流程：执行 `self:evolve` 同等闭环，并输出 `round-{n}/decision.json`
- 停止条件：
  - 达到 `--max-rounds`
  - 或出现 `no_gain`（未跨越阈值提升 `passRate`，且未跨越阈值降低 `usage.total`，且未跨越阈值降低 `llmElapsedMs`）
- 循环也支持阈值参数：`--min-pass-rate-delta` `--min-token-delta` `--min-latency-delta-ms`
- 汇总产物：`loop-report.json`（包含 `stoppedReason`、每轮摘要、最佳轮次）

## 运行期反馈驱动自演进
- 反馈入口：`POST /api/feedback`，写入 `.mimikit/evolve/feedback.jsonl`。
- manager 内部采集：manager 在识别到用户不满或纠错且有价值时，通过 `@capture_feedback {...}` 内部命令写入结构化反馈（支持 `category/confidence/roiScore/action/rationale/fingerprint`）。
- 空闲主动回顾：空闲轮次由 LLM 回顾最近会话并产出 `@capture_feedback`，用于补充被动漏采样本。
- 运行时信号采集：自动记录失败、高耗时、高 token 消耗等信号，统一写入反馈流。
- 反馈归档：每条反馈同时追加到 `.mimikit/evolve/feedback-archive.md`，并聚合为 `.mimikit/evolve/issue-queue.json`。
- 空闲触发：Worker Loop 在空闲状态下自动拉起 `system_evolve` 任务并消费“未处理反馈”。
- 去重与排序：按 `fingerprint` 去重，按 ROI/置信度/复现次数排序生成问题队列。
- 过滤策略：情绪化或低价值问题可标记 `ignore/defer`；仅高 ROI 问题进入自演进执行。
- 数据控量：按 `feedbackHistoryLimit` 截断待处理反馈，按 `issueMinRoiScore/issueMaxCountPerRound/feedbackSuiteMaxCases` 限制当轮样本。
- 演进执行：复用多 suite 决策逻辑与阈值策略，保持“评测→改写→验证→回滚”闭环一致性。
- 观测证据：`evolve_idle_run` 日志记录 `elapsedMs`、反馈样本数、基线/候选指标（含 token 与 llmElapsedMs）。

## 代码自演进触发
- 入口：`POST /api/evolve/code`，用于显式请求“代码+Prompt”自演进轮次。
- 触发后会重置 feedback 处理游标，并注入一条高优先级 runtime_signal 反馈。
- 实际执行仍遵循空闲调度，不抢占在线用户请求。

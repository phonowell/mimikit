# Mimikit 演进计划（2026-02-13）

## 一、清理：移除低价值机制

以下机制经代码审计确认无实际作用，应移除以降低认知负担。

### 1.1 LLM Archive Lookup Key 基础设施
- 位置：`src/storage/llm-archive.ts`（`normalizeForKey`、`buildLlmArchiveLookupKey`、`LlmArchiveLookup` 类型）+ `src/manager/runner.ts` 中的调用点
- 问题：key 算出后写入归档文件，但全系统无读取路径。暗示缓存/去重能力实际不存在
- 范围：移除 lookup key 生成与 `normalizeForKey`；保留 `appendLlmArchive` / `appendLlmArchiveResult` 写入能力不变

### 1.2 Action Loose Line 解析模式
- 位置：`src/actions/protocol/parse.ts`（`parseLooseLines`、`parseLine`、`LINE_RE`）
- 问题：manager prompt 明确要求 XML tags（`<MIMIKIT:actions>`），loose line 路径从未实际命中
- 范围：移除 `parseLooseLines` 及相关正则；`parseActions` 直接走 XML tag 分支

### 1.3 历史选择 System Role Rebalancing
- 位置：`src/orchestrator/read-model/history-select.ts`（`rebalanceRoles`、`SYSTEM_ROLE_MAX_RATIO`）
- 问题：system 消息仅在任务状态变更时写入，正常使用比例远低于 40% 阈值，从未触发
- 范围：移除 `rebalanceRoles` 函数及其在 `selectRecentHistory` 中的调用

### 1.4 `dedupeTaskResults` 别名
- 位置：`src/prompts/task-results-merge.ts`
- 问题：`dedupeTaskResults(x)` === `mergeTaskResults(x, [])`，纯别名，仅一处调用
- 范围：调用处内联后删除导出

---

## 二、增强：按 ROI 排序的演进项

### P0-A：Manager 重心状态（ROI 9.5）
- 痛点：manager 每轮从头拼装上下文，多轮对话中容易丢失意图焦点
- 设计方向：
  - 在 `RuntimeState` 中增加 `focusState` 字段（意图摘要、活跃任务 ID 列表、最近用户主题）
  - manager 每轮输出后提取/更新 focusState
  - 下轮 prompt 注入 focusState，使 manager 无需从历史重建上下文
- 关键约束：focusState 随 runtime-state.json 持久化；格式需 schema 校验
- 参考：pi-mono 的 steering/follow-up 双队列机制；js-ecosystem research 中的"重心状态对象"

### P0-B：历史压缩（ROI 9.0）
- 痛点：`selectRecentHistory` 按条数/字节截断，被裁剪的旧消息无摘要，重要上下文丢失
- 设计方向：
  - 历史超出窗口时，将被截断部分压缩为结构化摘要（摘要文本 + 涉及文件 + 关联任务 ID + 时间戳）
  - 摘要存入 `.mimikit/history-compacted.jsonl`
  - prompt 注入区增加 `compacted_context` 段，使 manager 保留全局上下文感知
- 关键约束：压缩由 manager 空闲轮次触发，不阻塞在线请求；压缩质量需可审计
- 参考：pi-mono compaction 机制（summary + readFiles + modifiedFiles）

### P1-A：Prompt 结构化降噪（ROI 8.5）
- 痛点：prompt 全量注入所有段落（7 段），空段仍占位；worker/evolver 接收不需要的信息
- 设计方向：
  - 引入 `promptMode` 概念：`full`（manager）/ `minimal`（worker/evolver）
  - `minimal` 模式仅注入 environment + task prompt，跳过 history/persona/user_profile 等
  - 空段不注入（当前 format 层已支持空检测，但 build 层未做条件裁剪）
  - 增加 prompt 预算日志：按段统计字节占比，写入 log 辅助调优
- 参考：moltbot 的 promptMode(full/minimal/none) + prompt 报表

### P1-B：Worker 多轮配置化（ROI 8.0）
- 痛点：`MAX_RUN_ROUNDS=3` 硬编码；简单任务浪费 token，复杂任务可能不够
- 设计方向：
  - `MAX_RUN_ROUNDS` 改为配置项，按 profile 区分（standard 默认 2，specialist 默认 5）
  - continue prompt 中注入已消耗轮次与 token 估算，让 LLM 辅助判断是否继续
- 关键约束：不改变 DONE_MARKER 协议；配置通过 config 注入

### P2-A：Action 协议统一（ROI 7.5）
- 痛点：`parse.ts` 存在双解析路径（loose line + XML tag），正则处理边缘情况脆弱
- 设计方向：
  - 清理 loose line 后（见 1.2），统一为 XML tag 单路径
  - 后续评估 `htmlparser2` 替代正则，提升容错能力（见 third-party-libraries ROI 报告）
- 关键约束：保持现有 action 协议格式不变；先统一再替换解析器

### P2-B：Evolver 验证闭环（ROI 7.0）
- 痛点：evolver 是项目核心差异化能力，但默认关闭且缺乏效果验证机制
- 设计方向：
  - 每次 evolver 变更记录 before/after diff + 变更理由
  - 建立回滚判据：若后续 N 轮 manager 表现下降（用户纠错频率上升），自动回滚
  - 验证通过后再默认启用
- 关键约束：遵循 CLAUDE.md 自演进原则（小步变更 + 可回滚 + 可验证）

### P3-A：状态持久化原子写入（ROI 6.5）
- 痛点：`runtime-state.json` 与队列 cursor 分步写入，崩溃时可能不一致
- 设计方向：确认 queue cursor 已在 `runtime-state.json` 的 `queues` 子对象中，确保单次原子写入覆盖所有状态
- 关键约束：不引入新存储引擎（sqlite 迁移成本当前不合理）

### P3-B：结构化可观测性（ROI 6.0）
- 痛点：仅 JSONL 日志，无法量化每任务 token 成本、延迟分布、fallback 触发率
- 设计方向：
  - 在现有 `appendLog` 基础上增加 `metrics` 事件类型（taskId、tokenCost、elapsedMs、provider、model）
  - 后续可选增加 `/api/metrics` 聚合查询端点
- 关键约束：不引入 Prometheus/OpenTelemetry 等重依赖

---

## 三、执行顺序建议

```
清理（1.1-1.4）→ P0-A/B 并行 → P1-A/B 并行 → P2-A → P2-B → P3-A/B
```

- 清理项无依赖，可一次性完成
- P0-A（focusState）与 P0-B（历史压缩）独立，可并行开发
- P1-A（promptMode）依赖 P0 稳定后再调整注入策略
- P2-A（协议统一）依赖清理 1.2 先完成

---

## 四、Research 采纳判断

| 来源 | 采纳点 | 未采纳点及原因 |
|---|---|---|
| pi-mono | focus state、compaction 结构化摘要 | 直接接入 `pi-ai` 作为 provider 层 — 迁移面过大，当前 provider 抽象已足够 |
| moltbot | promptMode 分级、prompt 预算报表、head+tail 截断策略 | 全套 prompt 风格迁移 — 投入产出比不明确，按需渐进吸收 |
| nanobot | 心跳触发 evolver 的思路 | 架构参考价值低（Python、无测试、无锁文件） |
| js-ecosystem | 重心状态对象概念 | 引入 openai-agents-js/langgraph — 自研 focusState 更可控 |
| third-party-libraries | htmlparser2（P2 评估） | better-sqlite3 — 当前 JSONL 规模下不值得迁移；ts-morph — 使用场景有限 |

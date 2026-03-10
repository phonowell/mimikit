# MIMIKIT 验证与打分流程（稳定版，后续迁移至 workflows）

## 1. 文档定位
本文件是代码回归的评分标准文件，目标是让不同执行者在同一数据窗口内得到稳定、可比的评分结果。

适用范围：
- 评分兼容视图：`focus`、`plan`、`task`、`action`、`memory`
- 运行时最小模型：`focus`、`task`、`context`（`trigger` 与 `evidence` 作为属性层）
- 核心能力：意图理解、任务编排、状态治理、稳定性、成本效率
- 关键机制：`cron`、`scheduled_at`、`on_worker_slot_freed` 触发链路

说明：
- 评分口径保留五概念兼容视图，用于历史对比与回归。
- 若产品语义将 `action` 合并入 `task_evidence`，评分中 `action` 视角改为“任务证据中的状态迁移质量”。

## 2. 版本与变更纪律
- 当前版本：`v1.3-stable`
- 评分口径、权重、阈值必须版本化；禁止无版本变更。
- 每次变更必须附：变更原因、影响指标、预计分数漂移范围。
- 变更日志必须记录：`schema_version` 影响范围与迁移窗口。

## 3. 固定输入与时间窗口规则
### 3.1 必选数据源
- `.mimikit/history/*.jsonl`
- `.mimikit/inputs/packets.jsonl`
- `.mimikit/results/packets.jsonl`
- `.mimikit/task-progress/*/*.jsonl`

### 3.2 口径新增数据源（v1.3）
- `.mimikit/schemas/*.json`
- `.mimikit/routing/*.jsonl`
- `.mimikit/contracts/*.jsonl`
- `.mimikit/evidence/*.jsonl`
- `.mimikit/cron/*.jsonl`
- `.mimikit/replay/golden-set/*.jsonl`

### 3.3 固定窗口（必须二选一）
1. `daily`：按自然日（本地时区）聚合
2. `release-window`：按两次 tag/commit 之间的事件时间

若未声明窗口类型，评分无效。

### 3.4 数据清洗规则（固定）
- JSON 解析失败记录入 `data_quality_issues`，但不参与评分分子分母。
- 同 `task_id` 多条结果按 `completedAt` 最新一条计入。
- `task-progress` 以文件为单位，`worker_start` 与 `worker_end` 必须对账。
- 结构化契约缺失按“缺失事件”计入，不允许静默忽略。

### 3.5 零分母与未采集规则（固定）
- 比率类指标分母为 `0` 时：
- 若该指标在当前窗口“不适用”，标记为 `na`，不参与概念子分聚合。
- 若该指标“应采集但未采集”，标记为 `not_collected`，按 `0` 计分并记录 `P0` 数据质量问题。
- 报告中必须同时输出 `na_count` 与 `not_collected_count`。

## 4. 基础指标定义（固定公式）
设：
- `R = total_results`
- `S = succeeded_results`
- `F = failed_results`
- `C = canceled_results`
- `I = total_intents`
- `D = done_intents`
- `P = partial_intents`
- `V = deviated_intents`
- `U = unfulfilled_intents`
- `AE = intents_with_action_evidence`
- `RP = routable_intents`
- `RC = route_correct_intents`
- `TP = task_progress_files`
- `TP_OK = files_with_start_and_end`

指标：
- `task_success_rate = S / R`
- `task_fail_rate = F / R`
- `task_cancel_rate = C / R`
- `intent_done_rate = D / I`
- `intent_deviated_rate = V / I`
- `intent_unfulfilled_rate = U / I`
- `action_evidence_rate = AE / I`
- `route_correct_rate = RC / RP`
- `progress_integrity_rate = TP_OK / TP`

## 5. 新增治理指标（10 项并入口径）
### 5.1 Schema 治理相关
- `schema_coverage_rate = schema_valid_events / total_governed_events`
- `schema_version_conflict_rate = schema_version_conflicts / total_schema_checked_events`

### 5.2 路由不变量相关
- `dual_truth_rate = dual_truth_records / total_checked_records`
- `focus_key_determinism_rate = deterministic_routes / replayed_route_cases`

### 5.3 契约与证据闸门相关
- `contract_completeness_rate = complete_contracts / total_contracts`
- `continuity_contract_match_rate = matched_contract_rounds / total_contract_rounds`
- `evidence_quality_pass_rate = evidence_pass_rounds / total_evidence_rounds`

### 5.4 上下文预算控制相关
- `manager_reask_rate = reask_rounds_due_to_missing_context / total_manager_rounds`
- `context_waste_ratio = unused_context_tokens / injected_context_tokens`
- `detail_recall_success_rate = successful_detail_recall_rounds / detail_recall_rounds`
- `context_budget_drift = rounds_outside_budget_band / total_manager_rounds`

### 5.5 cron 可靠性相关
- `cron_trigger_success_rate = successful_cron_triggers / total_cron_triggers`
- `cron_duplicate_suppression_rate = suppressed_duplicates / duplicate_trigger_attempts`
- `cron_false_trigger_rate = false_triggers / total_cron_triggers`
- `cron_trigger_latency_p95`：cron 触发到首个有效动作的 P95

### 5.6 回放与金标相关
- `golden_replay_match_rate = matched_golden_cases / total_golden_cases`
- `replay_determinism_rate = deterministic_replays / total_replay_runs`

## 6. 意图分类与状态判定（固定规则）
### 6.1 意图分类
意图必须来自结构化判定器（Intent Packet）；禁止关键词词表作为最终判定依据。

最小分类集：
- `execution`
- `control`
- `constraint`
- `query`
- `correction`
- `strategy`

### 6.2 状态判定
- `done`：存在对应系统动作证据且结果成功/状态完成
- `partial`：有确认或部分动作，但闭环不足
- `deviated`：执行方向与用户意图冲突，或安全拒绝导致目标未达成
- `unfulfilled`：无有效动作、无闭环

### 6.3 动作证据集合
以下任一项即算动作证据：
- `task_created/task_completed/task_canceled`
- `trigger_created/trigger_updated/trigger_deleted`
- `task_evidence_written`（含 `state_delta`）
- `memory_or_context_updated`
- `focus` 状态或归属变更事件

## 7. 五概念评分模型（0-10，固定权重）
### 7.1 focus
子分：
- 路由正确性（35%）：`route_correct_rate`
- 路由确定性（35%）：`focus_key_determinism_rate`
- 跨线隔离（30%）：跨线误路由反向指标

### 7.2 plan
子分：
- 触发准确性（35%）：触发后有效动作率
- 可控性（35%）：暂停/恢复/取消执行一致性
- 重复抑制（30%）：无效重复触发反向指标

### 7.3 task
子分：
- 生命周期完整性（30%）：`progress_integrity_rate`
- 执行成功率（30%）：`task_success_rate`
- 契约完整性（20%）：`contract_completeness_rate`
- 结果可追溯性（20%）：归档/证据完整率

### 7.4 action
子分：
- 意图到证据映射（30%）：`action_evidence_rate`
- 闭环完成率（30%）：`intent_done_rate`
- 证据质量（20%）：`evidence_quality_pass_rate`
- 偏离控制（20%）：`1 - intent_deviated_rate`

### 7.5 memory
子分：
- 事实回写一致性（30%）：`constraint` 类意图回写成功率
- 污染控制（30%）：低价值记忆写入反向指标
- 命中有效性（20%）：后续回合引用与正确使用率
- 连续性继承（20%）：`continuity_contract_match_rate`

## 8. 指标到分数映射（固定分档）
对所有“比例类指标”使用统一映射：
- `>= 0.98 -> 10`
- `[0.95, 0.98) -> 9`
- `[0.90, 0.95) -> 8`
- `[0.85, 0.90) -> 7`
- `[0.80, 0.85) -> 6`
- `[0.70, 0.80) -> 5`
- `[0.60, 0.70) -> 4`
- `[0.50, 0.60) -> 3`
- `< 0.50 -> 2`

反向指标（值越低越好）先做归一化后映射：
- `reverse_score(x) = score_map(1 - x)`
- 适用：`task_fail_rate`、`task_cancel_rate`、`intent_deviated_rate`、`schema_version_conflict_rate`、`dual_truth_rate`、`manager_reask_rate`、`context_waste_ratio`、`context_budget_drift`、`cron_false_trigger_rate`

非比例阈值：
- `cron_trigger_latency_p95` 使用固定阈值映射。

概念总分 = 子分加权平均（四舍五入到 1 位小数）。

## 9. 人工裁决规则（限制主观漂移）
- 仅允许以下场景人工裁决：
1. 安全拒绝（policy refusal）
2. 外部 provider 全局故障
3. 数据缺失导致自动判定不成立

- 人工裁决约束：
1. 每个概念最多调整 `±0.5`
2. 单次报告总调整绝对值不超过 `1.5`
3. 必须记录“调整原因 + 证据 + 原始分数”

若超出以上范围，本次评分判定为“不可复现”。

## 10. 稳定性判据（是否可作为回归基准）
在同一窗口、同一版本、连续执行 3 次评分：
- 每个概念分数标准差 `<= 0.2`
- 综合分标准差 `<= 0.15`
- 关键率指标（success/done/route/progress）波动 `<= 1%`
- `focus_key_determinism_rate` 与 `golden_replay_match_rate` 波动 `<= 0.5%`

满足即判定：`stable`。
否则判定：`unstable`，必须先修订口径或数据流程。

## 11. 输出格式（固定）
### 11.1 数据概况
- 任务量/成功率/失败率/取消率
- 时延（P50/P90/P95）
- token（总量与中位）
- `na_count` 与 `not_collected_count`

### 11.2 意图执行
- `done/partial/deviated/unfulfilled`
- `action_evidence_rate`
- `route_correct_rate`

### 11.3 五概念评分
- `focus/plan/task/action/memory`
- 各概念子分明细
- 人工裁决明细（如有）

### 11.4 新增治理指标
- `schema_coverage_rate`、`schema_version_conflict_rate`
- `dual_truth_rate`
- `contract_completeness_rate`、`continuity_contract_match_rate`、`evidence_quality_pass_rate`
- `manager_reask_rate`、`context_waste_ratio`、`detail_recall_success_rate`、`context_budget_drift`
- `cron_trigger_success_rate`、`cron_duplicate_suppression_rate`、`cron_false_trigger_rate`、`cron_trigger_latency_p95`
- `golden_replay_match_rate`、`replay_determinism_rate`

### 11.5 问题清单
- `P0/P1/P2`
- 每项给一条最小改进动作

### 11.6 稳定性结论
- `stable | unstable`
- 若 `unstable` 必须给出不稳定来源

## 12. 验收门槛（重构放量前）
### 12.1 基础门槛
- `focus/plan/task/action/memory` 均 `>= 9.0`
- `task_success_rate >= 95%`
- `intent_done_rate >= 92%`
- `route_correct_rate >= 98%`
- `progress_integrity_rate >= 99%`
- `P95 manager response` 分档达标：
- `lite(5k~8k) <= 2.0s`
- `standard(8k~12k) <= 2.5s`
- `heavy(12k~20k) <= 3.2s`
- `token median` 相对基线下降 `>= 30%`

### 12.2 唯一 No-Go 硬闸门（任一不满足即 No-Go）
- `schema_coverage_rate >= 99%`
- `schema_version_conflict_rate <= 0.5%`
- `dual_truth_rate <= 0.5%`
- `focus_key_determinism_rate >= 99%`
- `contract_completeness_rate >= 99%`
- `continuity_contract_match_rate >= 98%`
- `evidence_quality_pass_rate >= 98%`
- `manager_reask_rate <= 8%`
- `context_waste_ratio <= 20%`
- `context_budget_drift <= 10%`
- `detail_recall_success_rate >= 95%`
- `cron_trigger_success_rate >= 99%`
- `cron_duplicate_suppression_rate >= 98%`
- `cron_false_trigger_rate <= 0.5%`
- `cron_trigger_latency_p95 <= 2.5s`
- `golden_replay_match_rate >= 99%`
- `replay_determinism_rate >= 99%`

## 13. 回放记录模板（用于回归）
```markdown
窗口: {daily|release-window} {from..to}
评分版本: v1.3-stable

数据概况:
- R/S/F/C: ...
- 时延 P50/P90/P95: ...
- token: ...
- na_count/not_collected_count: ...

意图执行:
- I/D/P/V/U: ...
- action_evidence_rate: ...
- route_correct_rate: ...

五概念评分:
- focus: ...
- plan: ...
- task: ...
- action: ...
- memory: ...

治理指标:
- schema_coverage_rate: ...
- schema_version_conflict_rate: ...
- dual_truth_rate: ...
- focus_key_determinism_rate: ...
- contract_completeness_rate: ...
- continuity_contract_match_rate: ...
- evidence_quality_pass_rate: ...
- manager_reask_rate: ...
- context_waste_ratio: ...
- detail_recall_success_rate: ...
- context_budget_drift: ...
- cron_trigger_success_rate: ...
- cron_duplicate_suppression_rate: ...
- cron_false_trigger_rate: ...
- cron_trigger_latency_p95: ...
- golden_replay_match_rate: ...
- replay_determinism_rate: ...

人工裁决:
- none | 明细...

稳定性:
- stable | unstable
- 原因: ...
```

## 14. 回放集与金标集构成要求
最小集合必须覆盖：
- 模糊意图输入（含需要最小澄清场景）
- 多工作线并行与切换场景
- manager/worker 连续主题长链场景
- `cron` 触发、恢复、去重场景
- provider 波动与降级场景

每类至少 `20` 个样本，且样本集版本化管理。

## 15. 当前已知风险
- 当 Intent Packet 或 Task Contract 尚未全链路上线时，新增指标可能阶段性偏低。
- 路由正确率若缺少目标线真值标签，需使用代理指标并标注“不确定”。
- 若 provider 波动显著，应在报告中拆分 provider 维度评分。
- 若 `schema_version` 缺少严格登记，`schema_version_conflict_rate` 将被低估。

## 16. 与当前代码事件的对账口径（2026-03-08）
本节用于把评分指标映射到当前真实可采集事件，避免“文档有指标、运行无数据”。

### 16.1 contract/evidence 指标对账
1. `contract_completeness_rate`
- 分子：成功通过 `enqueue_task` 校验且携带完整 contract 的任务数。
- 分母：所有尝试执行 `enqueue_task` 的 action 数。
- 建议事件来源：action feedback + 任务创建日志。

2. `evidence_quality_pass_rate`
- 分子：任务结果包含 evidence，且无 `task_evidence_mismatch` 事件。
- 分母：所有带 contract 的任务结果数。
- 事件来源：`task_evidence_mismatch` 日志 + 任务归档 evidence 字段。

3. `continuity_contract_match_rate`
- 分子：同主题连续任务中，新任务 evidence 对应其自身 contract（非复用旧 contract）且判据条数一致。
- 分母：被判定为“连续主题”的任务对数。
- 事件来源：任务指纹/语义键、contract 字段、evidence.acceptanceChecks。

### 16.2 cron 指标对账
1. `cron_trigger_success_rate`
- 分子：`cron_trigger_metrics` 中 `outcome=triggered` 且后续存在有效动作证据的触发数。
- 分母：`cron_trigger_metrics` 中所有 cron/scheduled_at 触发尝试数。

2. `cron_duplicate_suppression_rate`
- 分子：同计划同秒重复触发被抑制次数。
- 分母：重复触发尝试次数。
- 事件来源：`trigger_fire_input`、`cron_trigger_metrics`、计划 `lastTriggeredAt`。

3. `cron_false_trigger_rate`
- 分子：触发后未形成有效动作证据且判定为误触发的次数。
- 分母：总触发次数。

### 16.3 上下文预算指标对账
1. `context_budget_drift`
- 事件来源：`manager_context_budget_tier`。
- 规则：按轮次对比“应在的档位”与“实际档位”；偏离计入 drift。

2. `manager_reask_rate` / `context_waste_ratio` / `detail_recall_success_rate`
- 当前代码已有分档与 wake profile 观测基础，但需在回归脚本中补充推导逻辑。
- 在脚本上线前，报告中必须标注 `not_collected`，不得伪造估算值。

### 16.4 稳定评分执行步骤（固定）
1. 固定窗口与版本（`v1.3-stable`）
2. 抽取事件并按本节映射生成指标
3. 输出 `na_count/not_collected_count`
4. 连续执行 3 轮，检查标准差是否达标
5. 若任一关键指标 `not_collected`，直接判定 `unstable`

## 17. 可执行命令（当前基线）
### 17.1 窗口评分
```bash
tsx scripts/rearchitecture/score-runtime-window.ts --work-dir=.mimikit --window-type=daily --from=2026-03-07 --to=2026-03-07
```

输出：
- 标准 JSON 报告
- 包含 `governance`、`thresholds`、`naCount`、`notCollectedCount`、`status`

### 17.2 Golden 回放
```bash
tsx scripts/rearchitecture/replay-golden-set.ts --work-dir=.mimikit --golden-set=overflows/golden-set-example.json
```

输出：
- `goldenReplayMatchRate`
- `replayDeterminismRate`
- 每条样本的 match 明细

### 17.3 结果解释规则
1. 若评分输出含 `not_collected`：
- 必须判定为 `unstable`
- 不得进入放量决策

2. 若回放匹配率低于门槛：
- 判定为 `No-Go`
- 必须先修复再重新回放

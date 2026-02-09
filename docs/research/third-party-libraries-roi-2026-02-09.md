# Mimikit 可库化精简清单（ROI 排序，2026-02-09）

## 范围
- 扫描范围：`src/` 运行时主链路（调度、存储、Action 解析、Prompt 组装、Worker actions）。
- 评估目标：定位“已自研且可被成熟第三方库稳定替代”的实现，按 ROI 排序。
- 统计口径：以可直接收敛的自研代码量、故障面、迁移侵入度综合打分（10 分制）。

## 结论（ROI 高→低）

| 排名 | 候选库 | 可替代模块 | 估算可收敛自研行数 | 预期收益 | 迁移成本/风险 | ROI |
|---|---|---|---:|---|---|---:|
| 1 | `zod`（或 `valibot`） | 输入与状态校验 | ~468 | 统一 schema、减少手写守卫与静默 fallback、提升可观测性 | 低：逐文件替换可回滚 | 9.4 |
| 2 | `p-queue` + `p-retry` | worker 并发与重试调度 | ~345 | 收敛重试/退避/并发状态机，降低分叉逻辑 | 中：需对齐现有状态持久化节奏 | 8.8 |
| 3 | `yaml` | Prompt YAML 拼接 | ~260 | 去除手写缩进/转义细节，降低格式漂移 | 低：替换序列化层即可 | 8.1 |
| 4 | `htmlparser2`（或 `node-html-parser`） | Action 区/标签解析 | ~254 | 降低复杂正则维护成本，提升鲁棒性 | 中：需保持现有 Action 协议兼容 | 7.5 |
| 5 | `better-sqlite3`（轻 DAO） | JSONL/JSONP 通道与游标 | ~302 | 原子性/游标查询/裁剪一致性更强，后续统计查询更容易 | 中高：涉及持久化格式迁移 | 6.9 |
| 6 | `gray-matter`（或 frontmatter 规范） | 任务/LLM 归档头解析 | ~442 | 归档协议标准化，解析容错更稳定 | 中：需兼容历史归档文件 | 6.2 |

## 关键证据（对应代码位置）
- `zod`/`valibot` 候选：`src/http/helpers.ts:56` `src/storage/runtime-state-schema.ts:1` `src/actions/shared/args.ts:14` `src/storage/task-progress.ts:13` `src/storage/task-checkpoint.ts:9`
- `p-queue`/`p-retry` 候选：`src/orchestrator/roles/worker/worker-dispatch.ts:61` `src/orchestrator/roles/worker/worker-run-retry.ts:78` `src/orchestrator/roles/thinker/thinker-action-apply.ts:78`
- `yaml` 候选：`src/prompts/format-base.ts:35` `src/prompts/format-content.ts:97`
- `htmlparser2` 候选：`src/actions/protocol/extract-block.ts:1` `src/actions/protocol/parse.ts:12`
- `better-sqlite3` 候选：`src/storage/jsonl.ts:1` `src/streams/jsonp-channel.ts:55` `src/storage/task-progress.ts:23`
- `gray-matter` 候选：`src/storage/task-results.ts:84` `src/storage/task-results-read.ts:48` `src/storage/llm-archive.ts:104`

## 落地优先级
- P0：先落地 `zod`（收益最高、改动小、验证快）。
- P1：落地 `p-queue+p-retry` 与 `yaml`（稳定性 + 维护成本双降）。
- P2：评估 `action parser` 与存储层升级（收益可观但迁移面更大）。

## P1 深化执行状态（2026-02-09）
- 状态：✓ 已完成（继续深挖三方库能力，不保留兼容分支）。
- `p-queue`：
  - worker 调度改为事件驱动（创建即入队 + 启动恢复重建队列）。
  - 去重使用 `id + sizeBy`，删除自管 `pending` 扫描路径。
- `p-retry`：
  - 使用 `signal + AbortError` 收敛取消路径。
  - 使用 `shouldConsumeRetry + shouldRetry` 控制重试预算消耗。
- `yaml`：
  - Prompt YAML 统一走 `yaml.stringify` 单入口。
  - 通过 `replacer` 过滤空值/无效值，移除分散条件拼接。
- 行为影响：
  - 任务启动延迟下降（不再依赖固定 1s 轮询）。
  - 取消后可立即终止重试链路。
  - YAML 输出稳定性提升，减少格式分叉。

## zod 全量执行状态（2026-02-09）
- 状态：✓ 已完成（按要求全量替换，不保留 legacy 兼容分支）。
- 覆盖模块：
  - `src/http/helpers.ts`
  - `src/storage/runtime-state.ts`
  - `src/storage/runtime-state-schema.ts`
  - `src/actions/shared/args.ts`
  - `src/actions/defs/fs/write.ts`
  - `src/actions/defs/fs/read.ts`
  - `src/actions/defs/fs/edit.ts`
  - `src/actions/defs/shell/exec.ts`
  - `src/actions/defs/browser/run.ts`
  - `src/storage/task-progress.ts`
  - `src/storage/task-checkpoint.ts`
- 测试同步：`test/messages-route.test.ts` `test/runtime-state.test.ts` `test/task-progress.test.ts` `test/worker-actions.test.ts`
- 行为变化：
  - `POST /api/input`：`zod` strict schema 校验，未知字段/类型错误直接拒绝。
  - `runtime-state.json`：仅接受新通道结构，不再兼容历史平铺 cursor 字段。
  - worker actions 参数：统一 schema 校验，拒绝未知字段与类型漂移。
  - `task-progress`/`task-checkpoint`：写入与读取均经 schema 校验，坏数据被过滤或拒绝。
- 去重收敛（同日第二轮）：`worker actions` 子集行数由 456 收敛至 425（净减 31 行）。

## 关于“468 行”与实际 diff
- `~468` 是“可替代潜力估算”，不是单次迭代的“净行数承诺”。
- 本次为全量 schema 显式化 + strict 校验 + 错误可观测增强，相关模块代码行数并未线性下降。

## 最小 PoC 建议
- PoC-1（1 天）：`zod` 仅覆盖 `HTTP input` + `runtime snapshot`。
- PoC-2（1 天）：`yaml` 替换 Prompt 输出序列化层，保持下游消费不变。
- 通过门槛：行为一致（测试通过）+ 错误可观测提升 + 无新增隐式 fallback。

## internal tools 三方实现盘点（2026-02-09）

### 已有可执行 action

| action | 当前实现 | 三方可替代/增强方案 | 结论 |
|---|---|---|---|
| `read_file` | 自研（按行窗口读取） | 无强必要；可选 `line-column` 做复杂定位 | 维持自研（低复杂度） |
| `search_files` | `fire-keeper/glob` + 自研逐行匹配 | `ripgrep` CLI、`ignore` + `micromatch` 组合 | 现阶段可用，后续可评估 `ripgrep` |
| `write_file` | 自研 + `fire-keeper/write` | `write-file-atomic`（已在项目存在） | 维持现状 |
| `edit_file` | 自研字符串替换 | `diff-match-patch`（更强容错编辑） | P1 候选 |
| `patch_file` | `diff@8.0.3` (`applyPatch`) | `diff-match-patch`（非 unified diff 生态） | 已采用 `diff` |
| `exec_shell` | `fire-keeper/exec` | `execa` | 暂不替换 |
| `run_browser` | `agent-browser` CLI | Playwright 直连 | 维持现状 |

### 已有任务/消息 action

| action | 形态 | 三方可替代 | 结论 |
|---|---|---|---|
| `create_task` / `cancel_task` / `summarize_task_result` / `capture_feedback` | 编排逻辑 | 无直接通用库 | 维持自研 |
| `respond` / `digest_context` / `handoff_context` | 协议动作 | 无直接通用库 | 维持自研 |

### 将要做（候选）

| 候选能力 | 三方方案 | ROI |
|---|---|---:|
| AST 级代码修改（替代纯文本编辑） | `ts-morph` | 8.7 |
| 更强搜索（忽略规则 + 速度） | `ripgrep` | 8.3 |
| 结构化 patch 合成/回滚 | `diff` + `parse-diff` | 7.8 |

### 本轮结论
- 已落地：`patch_file` 使用 `diff@8.0.3`。
- 已落地：`search_files` 使用 `fire-keeper/glob`（底层 fast-glob）。
- 下一步建议：若 `search_files` 成为热点，评估切到 `ripgrep` 管线。

# Mimikit 可库化精简清单（ROI 排序，2026-02-09）

## 范围
- 扫描范围：`src/` 运行时主链路（调度、存储、命令解析、Prompt 组装、Worker 工具）。
- 评估目标：定位“已自研且可被成熟第三方库稳定替代”的实现，按 ROI 排序。
- 统计口径：以可直接收敛的自研代码量、故障面、迁移侵入度综合打分（10 分制）。

## 结论（ROI 高→低）

| 排名 | 候选库 | 可替代模块 | 估算可收敛自研行数 | 预期收益 | 迁移成本/风险 | ROI |
|---|---|---|---:|---|---|---:|
| 1 | `zod`（或 `valibot`） | 输入与状态校验 | ~468 | 统一 schema、减少手写守卫与静默 fallback、提升可观测性 | 低：逐文件替换可回滚 | 9.4 |
| 2 | `p-queue` + `p-retry` | worker 并发与重试调度 | ~345 | 收敛重试/退避/并发状态机，降低分叉逻辑 | 中：需对齐现有状态持久化节奏 | 8.8 |
| 3 | `yaml` | Prompt YAML 拼接 | ~260 | 去除手写缩进/转义细节，降低格式漂移 | 低：替换序列化层即可 | 8.1 |
| 4 | `htmlparser2`（或 `node-html-parser`） | 命令区/标签解析 | ~254 | 降低复杂正则维护成本，提升鲁棒性 | 中：需保持现有命令协议兼容 | 7.5 |
| 5 | `better-sqlite3`（轻 DAO） | JSONL/JSONP 通道与游标 | ~302 | 原子性/游标查询/裁剪一致性更强，后续统计查询更容易 | 中高：涉及持久化格式迁移 | 6.9 |
| 6 | `gray-matter`（或 frontmatter 规范） | 任务/LLM 归档头解析 | ~442 | 归档协议标准化，解析容错更稳定 | 中：需兼容历史归档文件 | 6.2 |
| 7 | `diff` 生态（如 `diff`/`jsdiff`） | `apply_patch` 局部能力 | ~355 | 降低部分文本差异处理复杂度 | 高：当前协议是定制 patch 语法，难全替换 | 4.8 |

## 关键证据（对应代码位置）
- `zod`/`valibot` 候选：`src/http/helpers.ts:71` `src/storage/runtime-state.ts:30` `src/worker/tools/common.ts:14` `src/storage/task-progress.ts:44` `src/storage/task-checkpoint.ts:21`
- `p-queue`/`p-retry` 候选：`src/orchestrator/worker-loop.ts:44` `src/orchestrator/worker-run-retry.ts:66` `src/tasks/queue.ts:66`
- `yaml` 候选：`src/prompts/format-base.ts:35` `src/prompts/format-content.ts:97`
- `htmlparser2` 候选：`src/orchestrator/command-parser-zones.ts:1` `src/orchestrator/command-parser.ts:12`
- `better-sqlite3` 候选：`src/storage/jsonl.ts:1` `src/streams/jsonp-channel.ts:55` `src/storage/task-progress.ts:23`
- `gray-matter` 候选：`src/storage/task-results.ts:84` `src/storage/task-results-read.ts:48` `src/storage/llm-archive.ts:104`
- `diff` 候选：`src/worker/tools/apply-patch-parse.ts:50` `src/worker/tools/apply-patch-update.ts:46`

## 落地优先级
- P0：先落地 `zod`（收益最高、改动小、验证快）。
- P1：落地 `p-queue+p-retry` 与 `yaml`（稳定性 + 维护成本双降）。
- P2：评估 `command parser` 与存储层升级（收益可观但迁移面更大）。

## 最小 PoC 建议
- PoC-1（1 天）：`zod` 仅覆盖 `HTTP input` + `runtime snapshot`。
- PoC-2（1 天）：`yaml` 替换 Prompt 输出序列化层，保持下游消费不变。
- 通过门槛：行为一致（测试通过）+ 错误可观测提升 + 无新增隐式 fallback。

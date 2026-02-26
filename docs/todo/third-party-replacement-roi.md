# 自研代码可替换第三库清单（ROI 排序）

更新时间：2026-02-26  
范围：`src/`（当前约 `11063` 行）

## 评估方法

- 公式：`ROI 指数 = 净减行(中位) × 功能收益(1-5) / 迁移成本(1-5)`
- 净减行：`可删除自研行数 - 新增适配层行数`（估算区间取中位）
- 说明：以下按 ROI 从高到低排序；`LOC` 为当前仓库实测

## ROI 列表（高 -> 低）

| 排名 | 自研能力（范围 LOC） | 建议第三库 | 净减行估算 | 功能收益 | 迁移成本 | ROI 指数 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 文件持久化与并发串行（`786`） | `better-sqlite3` + `kysely` | `-350 ~ -490`（中位 `-420`） | `5` | `4` | `525` |
| 2 | Prompt 模板 include/if 渲染器（`287`） | `eta`（或 `nunjucks`） | `-120 ~ -180`（中位 `-150`） | `4` | `2` | `300` |
| 3 | Action 协议解析（`<M:...>` 标签提取，`374`） | `remark-parse` + `unist-util-visit`（HTML 节点遍历） | `-130 ~ -190`（中位 `-160`） | `4` | `3` | `213` |
| 4 | 历史检索引擎 glue（`204`） | `@orama/orama`（或 `minisearch`） | `-80 ~ -140`（中位 `-110`） | `3` | `2` | `165` |
| 5 | OpenAI Chat 流式 SSE 解析（`273`） | `openai` 官方 SDK（stream helper） | `-70 ~ -110`（中位 `-90`） | `4` | `3` | `120` |
| 6 | SSE/ETag 手写协议层（`282`） | `@fastify/sse-v2` + `@fastify/etag` | `-50 ~ -90`（中位 `-70`） | `3` | `2` | `105` |

## 每项范围与收益说明

### 1) 文件持久化 -> SQLite（最高 ROI）

- 当前范围（示例）：
  - `src/storage/jsonl.ts`
  - `src/storage/serialized-lock.ts`
  - `src/storage/task-results.ts`
  - `src/storage/task-results-read.ts`
  - `src/storage/task-progress.ts`
  - `src/storage/runtime-snapshot.ts`
  - `src/history/store.ts`
  - `src/fs/json.ts`
- 功能收益：
  - 事务一致性（替代“文件锁 + 全文件读写”）
  - 可建立索引（`taskId/date/status`），避免目录扫描
  - 历史/结果读取延迟更稳定
- 风险与成本：
  - 需要一次性迁移现有 `.jsonl/.json` 状态
  - 需要定义 schema 演进策略

### 2) Prompt 模板渲染器 -> Eta/Nunjucks

- 当前范围：
  - `src/prompts/format.ts`
  - `src/prompts/prompt-loader.ts`
- 功能收益：
  - 模板条件、partial/include 交给成熟引擎
  - 降低手写解析边界错误（if/else/endif、include 循环）

### 3) Action 协议解析 -> remark AST

- 当前范围：
  - `src/actions/protocol/*.ts`
- 功能收益：
  - 复用 Markdown AST；减少“代码块排除/标签配对/属性解析”手工逻辑
  - 标签嵌套与尾部碎片处理更稳

### 4) 历史检索 -> Orama/MiniSearch

- 当前范围：
  - `src/history/query.ts`
- 功能收益：
  - BM25/过滤能力开箱
  - 降低自定义评分与 tokenization 维护成本

### 5) OpenAI Chat provider -> 官方 SDK

- 当前范围：
  - `src/providers/openai-chat-provider.ts`
- 功能收益：
  - 减少手写 SSE 切片/JSON chunk 解析
  - 错误类型与重试语义可复用 SDK

### 6) SSE/ETag -> Fastify 插件

- 当前范围：
  - `src/http/routes-api.ts`
- 功能收益：
  - 简化 SSE 心跳/连接清理逻辑
  - 减少 ETag 比对与 304 细节代码

## 依赖与去重关系

- `#1` 与 `#4` 高度重叠：若先做 SQLite，`#4` 仅保留“排序策略”层，净减行会下调约 `50~80`。
- `#2` 与 `#3` 独立，可并行推进。
- `#5` 与 `#6` 独立，但都影响在线请求链路，建议分批上线。

## 建议执行顺序（按 ROI 与风险平衡）

1. `#2 Prompt 模板引擎替换`（快收益、低风险）
2. `#1 文件持久化 -> SQLite`（最大总收益）
3. `#3 Action 协议解析替换`
4. `#5/#6` 二选一先落地，再推进另一项

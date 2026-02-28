# 工程 ROI Backlog

更新时间：2026-02-28  
范围：`src/`

## 评分方法

- `ROI = 净减行（中位） × 功能收益 / 迁移成本`
- 功能收益、迁移成本取值：`1~5`

## 活跃项（高 -> 低）

| 排名 | 主题 | 目标 | 估算净减行 | 功能收益 | 迁移成本 | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 文件持久化改造 | JSONL + 文件锁 -> SQLite（`better-sqlite3` + `kysely`） | `-350 ~ -490`（中位 `-420`） | 5 | 4 | 525 |
| 2 | 历史检索引擎 | 自研评分/tokenization -> `@orama/orama`（或 `minisearch`） | `-80 ~ -140`（中位 `-110`） | 3 | 2 | 165 |
| 3 | Worker 轮次配置化 | 将 worker 轮次上限改为配置项 | `+10 ~ +25` | 3 | 1 | 配置治理收益 |

## 执行说明

### 1) 文件持久化 -> SQLite

- 主要影响：`src/storage/*`、`src/history/store.ts`、`src/fs/json.ts`
- 预期收益：事务一致性、索引查询能力、读写延迟稳定
- 主要风险：历史状态迁移与 schema 演进

### 2) 历史检索 -> Orama/MiniSearch

- 主要影响：`src/history/query.ts`
- 预期收益：减少手写 BM25/tokenization 维护成本
- 依赖关系：若先完成 SQLite，需要重估检索改造范围

### 3) Worker 轮次配置化

- 主要影响：`src/worker/profiled-runner.ts`、`src/config.ts`、`config/default.yaml`
- 目标：新增可配置轮次上限并从 runtime 配置读取
- 验收：默认行为不变，支持按环境覆盖

## 已归档清理

- 原 `low-roi-code-pruning-candidates.md` 已删除：内容存在大量失效文件引用，且与本 backlog 目标重复。
- 低 ROI/历史复盘类条目不再单独建文档，统一在本文件维护“活跃可执行项”。

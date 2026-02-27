# 工程 ROI Backlog

更新时间：2026-02-27
范围：`src/`

## 评分方法

- `ROI = 净减行（中位） × 功能收益 / 迁移成本`
- 功能收益与迁移成本取值：`1~5`

## 活跃项（高 -> 低）

| 排名 | 主题 | 目标 | 估算净减行 | 功能收益 | 迁移成本 | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 文件持久化改造 | JSONL + 文件锁 -> SQLite（`better-sqlite3` + `kysely`） | `-350 ~ -490`（中位 `-420`） | 5 | 4 | 525 |
| 2 | 历史检索引擎 | 自研评分/tokenization -> `@orama/orama`（或 `minisearch`） | `-80 ~ -140`（中位 `-110`） | 3 | 2 | 165 |
| 3 | Worker 轮次配置化 | `MAX_RUN_ROUNDS` 硬编码改为配置项 | `+10 ~ +25` | 3 | 1 | 配置治理收益 |

## 执行说明

### 1) 文件持久化 -> SQLite

- 主要影响：`src/storage/*`、`src/history/store.ts`、`src/fs/json.ts`
- 预期收益：事务一致性、索引查询、读写延迟稳定。
- 主要风险：历史状态迁移与 schema 演进。

### 2) 历史检索 -> Orama/MiniSearch

- 主要影响：`src/history/query.ts`
- 预期收益：减少手写 BM25 与 tokenization 维护负担。
- 依赖关系：若先完成 SQLite，检索改造范围需重估。

### 3) Worker 轮次配置化

- 位置：`src/worker/profiled-runner.ts`
- 目标：新增 `AppConfig.worker.maxRounds` 并从 runtime 配置读取。
- 验收：默认行为不变，允许按环境覆盖。

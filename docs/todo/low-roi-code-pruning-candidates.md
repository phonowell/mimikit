# 冗余/低 ROI 代码裁剪候选

更新时间：2026-02-27
范围：`src/`（静态引用 + 重复实现扫描）
目的：供审核后执行裁剪，不在本文件直接落代码改动

## 说明

- 本清单聚焦“冗余实现/低收益维护成本”，不重复 `docs/todo/third-party-replacement-roi.md` 已立项项。
- `净减行` 为估算值，真实值以实施 PR diff 为准。
- 状态：`→ 待审`

## 候选清单（ROI 高 -> 低）

| 状态 | 候选 | 证据 | 净减行(估算) | 风险 |
| --- | --- | --- | --- | --- |
| → 待审 | 删除 `src/types/fire-keeper-shim.d.ts`（`fs-extra` 遗留声明） | 仓库内 `rg "fs-extra" src test scripts` 仅命中该文件；当前依赖/代码未使用 `fs-extra` | `-34` | 极低 |
| → 待审 | 评估删除 `src/index.ts`（未接线的库入口） | 仓库内无导入；`package.json` 未声明 `main/exports` 指向该入口 | `-22` | 中：若有仓库外 SDK 用户会破坏导入 |
| → 待审 | 关闭或删除 trace archive 写入链路 | `src/storage/traces-archive.ts` 仅被 `src/manager/runner.ts`、`src/worker/profiled-runner-loop.ts` 调用；仓库内无 trace 读取接口 | `-120 ~ -220` | 中：排障可观测性下降 |
| → 待审 | 合并 task 路由薄封装并去重 `resolveRouteId` | `src/http/routes-api-task-routes.ts` 仅 2 行转发；`routes-api-task-archive.ts` 与 `routes-api-task-cancel.ts` 各有一份 `resolveRouteId` | `-15 ~ -35` | 低 |
| → 待审 | 合并重复错误码提取函数 | `getErrorCode/readErrorCode` 散落于 `src/cli/runtime-lock.ts`、`src/fs/paths.ts`、`src/log/safe.ts`、`src/storage/runtime-snapshot.ts` | `-15 ~ -30` | 低 |
| → 待审 | 抽取统一“读取文本文件”工具，移除重复 Buffer/ENOENT 样板 | 相同逻辑重复出现在 `src/prompts/build-prompts.ts`、`src/prompts/prompt-loader.ts`、`src/providers/openai-settings.ts`、`src/http/routes-api-task-archive.ts`、`src/storage/task-results-read.ts` | `-35 ~ -70` | 低 |
| → 待审 | 合并重复业务谓词（idle/abort/fingerprint） | `isIdleSystemInput`（`loop-idle.ts` + `loop-batch-pre.ts`）、`isAbortLikeError`（`profiled-runner-loop.ts` + `run-retry.ts`）、`isActiveTask/taskToFingerprintInput`（`task-lifecycle.ts` + `task-state.ts`）重复 | `-20 ~ -45` | 低 |
| → 待审 | 回收过度拆分的 manager 批处理薄模块 | `loop-batch-intent.ts`、`loop-batch-history.ts`、`loop-batch-stream.ts`、`loop-batch-manager-call.ts` 均为单调用点胶水层（主要由 `loop-batch-run-manager.ts` 使用） | `-10 ~ -25` | 中：文件合并后单文件长度可能上升 |

## 建议裁剪顺序

1. `src/types/fire-keeper-shim.d.ts`。
2. task 路由薄层 + `resolveRouteId` 去重。
3. 错误码提取函数合并 + 读文件样板工具合并。
4. 重复业务谓词合并。
5. trace archive 改为配置开关，验证无回归后再考虑彻底删除。
6. 最后评估 `src/index.ts`（先确认是否存在仓库外引用）。

## 审核检查点

- 是否接受 `trace archive` 可观测性下降。
- 是否存在仓库外对 `src/index.ts` 的直接导入。
- 合并后是否仍满足“文件 < 200 行”约束。

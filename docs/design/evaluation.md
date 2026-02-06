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
- `history/inputs/tasks/results` 直接映射 `runManager` 入参

## 断言类型
- 命令次数：`expect.commands.<action>.min|max`
- 输出必含：`expect.output.mustContain[]`
- 输出禁含：`expect.output.mustNotContain[]`

## 报告与产物
- JSON：`./.mimikit/generated/replay/*.json`
- Markdown：`./.mimikit/generated/replay/*.md`
- 报告字段：`suite/runAt/model/total/passed/failed/passRate/cases[]`

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

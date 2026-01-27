# Task Plan: self-iteration-min

## 目标
- 最小化补足“验收 + 失败迭代 + 边界控制”以形成可用闭环（任务执行→验证→失败再试/终止）。

## 范围
- 仅新增最小字段与执行逻辑，不引入 UI/插件/向量索引。
- 验证以可配置命令为主，默认不自动修复，必要时受控重试。

## 关键参考
- src/runtime/master.ts:18
- src/runtime/master.ts:109
- src/runtime/master.ts:212
- src/runtime/ledger.ts:10
- src/runtime/ledger.ts:31
- src/runtime/ledger.ts:61
- src/server/http.ts:52
- src/cli.ts:6
- src/cli.ts:62
- src/config.ts:10
- src/config.ts:76
- src/runtime/worker.ts:64

## 计划步骤
1) 明确闭环最小规格（验收方式/重试策略/边界）：选择“verify 命令 + 有界重试 + 失败停止”或更简化方案，并确定字段命名与默认值（影响 src/runtime/master.ts:18, src/config.ts:10）。
2) 扩展数据模型与账本：新增 TaskRequest/TaskRecord 字段（verifyCommand/maxIterations/attempt 等）并更新 tasks.md 格式与解析（src/runtime/ledger.ts:10, src/runtime/ledger.ts:31, src/runtime/ledger.ts:61）。
3) 实现验证与最小迭代：在 Master 执行 worker 后运行 verify 命令，失败则根据 maxIterations 构造“修复提示”再跑 worker；追加 ledger/ transcript 记录（src/runtime/master.ts:109）。
4) 打通入口：CLI `ask` 与 HTTP `/tasks` 支持 verify/maxIterations，usage 文案同步（src/cli.ts:6, src/server/http.ts:52）。
5) 验证闭环：用一条任务 + verify 命令验证“成功结束/失败重试/超限停止”，记录结果与限制（docs 或 notes 中）。

## 文件清单（拟改）
- src/config.ts
- src/cli.ts
- src/server/http.ts
- src/runtime/master.ts
- src/runtime/ledger.ts
- （可选新增）src/runtime/verify.ts
- （可选更新）docs/minimal-architecture.md / docs/minimal-implementation-plan.md

## 风险/假设（推测，待确认）
- verify 命令执行存在安全风险，需要限制为工作区命令或由用户明确提供。
- 重试会消耗 codex 配额，需设置上限与失败退出。

## 状态
- [x] Step 1
- [x] Step 2
- [x] Step 3
- [x] Step 4
- [x] Step 5

## 记录
- Step 1: 采用“verify 命令 + 有界重试 + 失败停止”；默认 maxIterations=2（含首次），用户可覆盖。
- Step 2: TaskRecord 追加 attempt/maxIterations/verifyCommand 字段；tasks.md 序列化/解析同步。
- Step 3: Master 增加 verify 执行与失败重试循环；新增 runVerifyCommand。
- Step 4: CLI 与 HTTP 支持 verifyCommand/maxIterations 入参。
- Step 5: 任务 A verify 通过（attempt=1, result=42）；任务 B verify 恒失败触发重试并在 attempt=2 停止（status=failed）。

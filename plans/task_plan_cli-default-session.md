# task_plan_cli-default-session

## 目标
- `ask` 支持缺省 session（默认 `default`）。
- `pnpm ask <message>` 直接传入消息。
- 增加“重启 server 应用变更”的指令说明。

## 阶段
1. `src/cli.ts` + `src/cli/args.ts`：解析缺省 session 与位置参数 message，更新用法提示。
2. `tests/cli-args.test.ts`：补最小测试覆盖解析行为。
3. `docs/minimal-notes.md`：追加重启 server 指令。

## 决策
- 本次更改不使用 worktree。

## 错误
- 无

## 状态
- 进度 3/3

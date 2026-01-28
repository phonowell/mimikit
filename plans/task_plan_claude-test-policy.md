# 任务计划: claude-test-policy

## 目标
- 更新 `CLAUDE.md` 测试策略为“非主动添加；仅 debug 需要时添加最小化测试”。
- 移除现有全部测试用例（`tests/` 下 *.test.ts）。

## 步骤
1. 已完成：读取 `CLAUDE.md` 与当前测试文件清单。
2. 已完成：修改 `CLAUDE.md` 中测试规则（替换现有测试要求）。
3. 已完成：删除 `tests/` 下所有测试文件。
4. 已完成：确认无残留 `*.test.*` 文件并记录变更。

## 文件
- `CLAUDE.md`
- `tests/`
- `plans/task_plan_claude-test-policy.md`
- `plans/notes_claude-test-policy.md`

## 决策
- 用新测试策略替换原“新功能必须配套测试”规则，避免冲突。
- 不清理 `package.json` 中测试配置；仅移除当前测试文件。

## 风险/备注
- 移除测试后，现有测试脚本可能失效（已知且接受）。

## 状态
- 当前进度：4/4

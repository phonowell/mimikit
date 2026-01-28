# Notes: claude-test-policy

- 假设："移除当前所有的测试用例" 指删除 `tests/` 下现有 *.test.ts 文件。
- 决策：不清理 `package.json` 中测试相关配置。
- 范围：仅移除当前测试文件，不处理未来测试策略。

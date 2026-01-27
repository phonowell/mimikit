# Notes: verify-functionality

## 假设/待确认
- 运行验证需要 `codex` CLI 可用；若缺失可能需要替代策略。
- 允许在工作目录写入 `.mimikit/` 状态数据。

## 决策
- 待补充。

## 发现/问题
- 默认 sandbox 下运行 `pnpm serve` 触发 tsx IPC listen EPERM；需在非 sandbox 权限下启动服务并访问 localhost。

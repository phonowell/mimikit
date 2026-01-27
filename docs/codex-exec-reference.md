# Codex exec 接口备忘

## 用途
- `codex exec` 为非交互执行入口，适合作为子进程运行。
- `codex exec resume` 可用 sessionId 续跑。

## 常用参数
- `-C, --cd <DIR>`: 指定工作目录。
- `--json`: 输出 JSONL 事件流，便于解析。
- `--output-last-message <FILE>`: 把最终回复写入文件。
- `-m, --model <MODEL>`: 指定模型。
- `-p, --profile <PROFILE>`: 使用配置文件 profile。
- `--sandbox <MODE>`: `read-only` / `workspace-write` / `danger-full-access`。
- `--full-auto`: 低摩擦自动执行 (相当于 `-a on-request` + `--sandbox workspace-write`)。
- `--dangerously-bypass-approvals-and-sandbox`: 跳过审批与沙箱 (高风险)。

## Resume 用法
- `codex exec resume <sessionId> <prompt>`
- `--last` 可恢复最近一次会话

## 获取 sessionId
- CLI 可能在退出提示里输出: `To continue this session, run codex resume <id>`。
- 建议优先从 `--json` 事件流中提取，若无则解析提示行作为兜底。
- 实测：立即 Ctrl+C 中断时未看到 sessionId 输出；不要依赖中断输出拿 id。
- 实测：`--json` 正常完成时会出现 `thread.started`，其中 `thread_id` 可用作 sessionId。

## 建议默认值
- `--sandbox workspace-write` 作为默认安全边界。
- 仅在用户显式配置时启用 `--full-auto`。

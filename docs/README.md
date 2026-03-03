# 文档导航

## 建议阅读顺序

1. 系统设计入口：`./design/README.md`
2. 架构与运行时：`./design/architecture/system-architecture.md`
3. Workflow 索引：`./design/workflow/task-and-action.md`
4. 接口与状态：`./design/workflow/interfaces-and-state.md`
5. WebUI 规范：`./design/ui/webui-design-language.md`
6. Codex SDK 接入：`./reference/sdk/codex-sdk.md`
7. 外部对比结论：`./reference/comparisons/known.md`
8. CoPaw QQ 渠道调研：`./reference/comparisons/copaw-qq-channel-research.md`
9. 工程改进待办：`./todo/engineering-roi-backlog.md`

## 目录职责

- `design/`：当前实现事实源（架构、协议、接口、UI）。
- `reference/`：外部能力接入与调研结论。
- `todo/`：仅保留未完成且可执行的 backlog。

## 维护规则

- 冲突时以 `src/` 与 `config.yaml` 为准。
- 同一事实只保留一个主文档，避免重复索引。
- 文档中的命令、路径、接口必须可在仓库中定位。
- 过程日志不进入 `docs/`；只保留可复用结论。

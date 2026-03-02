# 文档导航

## 建议阅读顺序

1. 系统设计总览：`./design/README.md`
2. 架构与运行时：`./design/architecture/system-architecture.md`
3. Workflow 索引：`./design/workflow/task-and-action.md`
4. 任务概念：`./design/workflow/task.md`
5. 动作协议：`./design/workflow/action.md`
6. 计划机制：`./design/workflow/plan.md`
7. 焦点机制：`./design/workflow/focus.md`
8. 记忆机制：`./design/workflow/memory.md`
9. 接口与状态：`./design/workflow/interfaces-and-state.md`
10. WebUI 设计语言：`./design/ui/webui-design-language.md`
11. SDK 接入现状：`./reference/sdk/codex-sdk.md`
12. 外部对比结论：`./reference/comparisons/known.md`
13. CoPaw QQ 渠道调研：`./reference/comparisons/copaw-qq-channel-research.md`
14. 工程 ROI backlog：`./todo/engineering-roi-backlog.md`

## 目录职责

- `design/`：当前实现单一事实源（架构、协议、接口、UI 规范）。
- `reference/`：外部能力接入结论与跨项目对比结论。
- `todo/`：仅保留“未完成且可执行”的工程改进项。

## 本轮清理

- 删除薄索引页：`reference`/`todo` 下多层 README 跳转页。
- 删除过时文档：历史执行记录与失效候选清单。
- 对齐代码：更新 `interfaces-and-state.md` 的 API、状态目录、文件映射与实现入口。

## 维护规则

- 同一事实只保留一个主文档，避免“索引套索引”。
- 历史过程稿在结论沉淀后删除，不长期保留。
- 文档中出现源码路径时，必须可在仓库中直接定位。
- 参考项目调研默认基于本地快照；不要求每次任务前校验远端最新。
- 参考项目探索默认只读文档（README/docs/*.md/SKILL.md），除非任务明确要求看代码。

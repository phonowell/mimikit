# 运行时 Agent 规范

## 适用范围
- 本文件描述 Mimikit 运行时系统（Supervisor/Agent/Task）的行为与约束。
- 开发/改代码规范见 `CLAUDE.md`。

## 核心行为
- Supervisor 常驻；Agent 按需唤醒（事件/定时）。
- 运行日志写入 `.mimikit/tasks.md`（程序追加，用于回溯）。
- 委派协议与流程见 `docs/minimal-architecture.md`。

## 环境与访问
- 运行环境位于中国大陆，避免使用该地区不可访问或访问缓慢的服务。

## 状态目录
- 运行时状态位于 `.mimikit/`，结构与恢复机制见 `docs/minimal-architecture.md`。

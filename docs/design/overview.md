# 系统概览 (v4)

> 返回 [系统设计总览](./README.md)

## 设计目标
- Manager 统一理解与回复
- Worker 并发执行任务
- 内存队列简化调度
- 状态落盘最小化（历史 + 日志 + 结果）

## 组件
- Supervisor：启动双循环并管理运行状态
- Manager：面向用户的对话与调度
- Worker：任务执行
- WebUI/HTTP：输入与状态展示

## 核心流程（高层）
1. 用户输入 → Manager 回复并可派发任务。
2. Worker 从内存队列取任务执行并回传结果。
3. Manager 汇总结果并告知用户。

## 状态目录
详见 docs/design/state-directory.md。

## 深入阅读
- 双循环细节：docs/design/supervisor.md
- 任务生命周期与结构：docs/design/task-system.md / docs/design/task-data.md
- MIMIKIT 命令协议：docs/design/commands.md
- HTTP/CLI：docs/design/interfaces.md

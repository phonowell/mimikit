# notes_core-goal-20260128-2

## 差距
- 7x24: 仍依赖外部守护，需内置 supervisor 能力
- 自驱演化: 需周期性自改进触发机制

## 方案
- CLI supervisor: 监听子进程退出并重启（tsx 子进程）
- Self-improve: 读取 lessons tail，基于 prompt 周期触发改进任务

## 完成情况
- gap: 0
- 7x24: supervisor + heartbeat
- 自驱演化: self-improve 周期触发

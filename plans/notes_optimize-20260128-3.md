# notes_optimize-20260128-3

## 10 个优化项
1. self-improve 避免同 sessionKey 已有 active task 时重复入队
2. self-improve 状态写入改为原子写
3. worker output 临时文件在失败/异常时也清理
4. self-eval 启发式检测空输出 -> issue
5. maxWorkers 下限为 1，避免 0 导致停摆
6. /health 增加 self-improve 最近运行信息
7. 记录 verify 失败摘要到 TaskRecord（便于快速定位）
8. memory 搜索命中去重（同文件多行降噪）
9. heartbeat 增加最近任务更新时间
10. worker 超时后追加 SIGKILL 兜底

## ROI 最高五项
- 1 self-improve 防重复入队
- 2 self-improve 原子写
- 3 worker 输出文件清理
- 4 self-eval 空输出检测
- 5 maxWorkers 下限

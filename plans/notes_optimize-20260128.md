# notes_optimize-20260128

## 10 个优化项
1. 自评估跳过会话列表（降成本/降噪）
2. lessons 文件大小上限与截断（防无限增长）
3. supervisor 重启指数退避（防抖动）
4. self-improve 忙时跳过（避免堆积）
5. self-improve 仅在 lesson 更新后触发（已有哈希）
6. heartbeat 写入原子化（减少部分写）
7. /health 追加关键配置摘要（便于运维）
8. tasks ledger 启动时超过阈值即压缩（减少热路径）
9. 自评估输出解析失败时降级提示（已有）
10. memory 查询 normalize 限长（已有）

## ROI 最高三项
- 1 自评估跳过会话列表
- 2 lessons 文件大小上限与截断
- 3 supervisor 重启指数退避

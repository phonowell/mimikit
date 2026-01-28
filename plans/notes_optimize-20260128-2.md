# notes_optimize-20260128-2

## 10 个优化项
1. heartbeat 写入原子化（tmp + rename）
2. /health 增加重要开关摘要
3. self-eval 默认跳过 self-improve 会话
4. tasks ledger 读取失败时降级空 + 告警
5. self-improve 读取 lessons 失败降级禁用本次
6. verifyCommand 超时支持单独配置
7. memory 搜索结果按文件去重（降噪）
8. self-eval 对于超长输出先截断评估
9. session 删除时也清理 self-improve 状态
10. tasks ledger 解析异常记录错误行

## ROI 最高三项
- 1 heartbeat 原子写入
- 2 /health 配置摘要
- 3 self-eval 默认跳过 self-improve 会话

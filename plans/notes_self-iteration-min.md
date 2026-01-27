# Notes: self-iteration-min

## 假设/待确认
- verify 命令的执行范围与安全边界由用户控制。
- 失败重试上限由配置或请求指定。

## 决策
- 采用 verify 命令 + 有界重试；默认 maxIterations=2（含首次），可由请求覆盖。

## 发现/问题
- 验证任务通过后即完成；失败任务在 maxIterations 达到后写入 failed 结果并停止重试。
- verifyCommand 以单行 shell 执行，stdout/stderr 仅用于错误信息；校验逻辑建议靠 exit code。

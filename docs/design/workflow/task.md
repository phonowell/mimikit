# 任务（Task）

> 返回 [Workflow 索引](./task-and-action.md)

## 文档定位

- Task 主规范覆盖生命周期、派发去重、暂停恢复、结果回写与 git 闭环
- 对应实现主源：`src/execution/worker/*`、`src/policy/manager/*`、`src/work/orchestrator/*`

## 生命周期

- `pending`
- `paused`
- `running`
- `succeeded | failed | canceled`

## 派发入口

- 创建任务：`enqueue_task`
- 控制任务：`task_control`
- git 闭环写回：`record_task_git`

## 任务合同

- manager 只接受结构化 `task`：
  - `title`
  - `cwd`
  - `mode`
  - `goal`
  - `in_scope[]`
  - `out_of_scope[]`
  - `done_when[]`
  - `context_refs[]`
  - `instructions[]`
- 运行时据此生成 worker prompt 与 `TaskContract`
- `worker_prompt` 已删除
- `branch` 已删除

## 去重与替换

- 单轮去重键：`prompt + title + cwd + profile + provider + focusId + contract`
- active 任务去重键：`task.fingerprint`
- 语义冲突键：`task.semanticKey`
- 若命中同语义旧 active task 且 fingerprint 不同，运行时会取消旧任务并保留新任务
- 若命中同 fingerprint 的 pending task，运行时复用已有任务并重新入队

## 暂停 / 恢复 / 取消

- `task_control(action="pause")`：`pending|running -> paused`
- `task_control(action="resume")`：`paused -> pending`
- `task_control(action="cancel")`：`pending|paused|running -> canceled`
- `instructions[]` 只在 `resume` 时生效；恢复后的下一轮 worker prompt 会附带一次性补充说明

## 执行与回写

1. manager 创建或复用 task
2. worker 调度外部执行运行时
3. worker 结果收敛为 `task.result`
4. 结果归档并发布到 `results`
5. manager 消费压缩后的结果与归档路径

## Git 闭环

- `record_task_git(state="review_passed")`
- `record_task_git(state="merged")`
- `record_task_git(state="cleaned")`
- 只允许对已完成且带 `Task.git` 的任务写回
- 写回会同步更新：
  - `task.git.lifecycle`
  - `task.result.handoff.git.lifecycle`
  - 任务归档 frontmatter / handoff

## 结果约束

- 成功结果必须通过结构化 handoff 协议收敛
- manager 只消费压缩结果：结论、证据路径、归档路径、git lifecycle 等
- 不回灌 worker 原始长 prompt 或大段上下文

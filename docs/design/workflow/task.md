# 任务（Task）

> 返回 [Workflow 索引](./task-and-action.md)

## 文档定位
- Task 主规范覆盖生命周期、派发去重、暂停恢复、结果回写与 git 闭环，强调它是 manager 派发给 subagent 的局部执行合同。
- Task 可以分别归属不同的 focus/workline，而 manager 的第一职责是持续推进项目组合，并非事事证明协议完整。
- 对应实现主源：`src/execution/worker/*`、`src/policy/manager/*`、`src/work/orchestrator/*`

## 生命周期

- `pending`
- `paused`
- `running`
- `succeeded | failed | canceled`

## 派发入口

- 创建任务：`enqueue_task`
- 控制任务：`task_control`

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
- 运行时会把稳定 `TaskContract` 摘要保存在 task 上，供 manager 在 `state_packet.tasks` 中查看合同级细节
- `worker_prompt` 已删除
- `branch` 已删除
- `cwd` 必须指向现有目录。
- `use_worktree` 必填；不需要独立 worktree 时显式传 `false`。仅当 `use_worktree=true` 且 `mode="write"` 时，运行时才会为仓库任务准备独立 worktree。
- 对 `use_worktree=true` 的仓库写任务，`cwd` 只提交仓库内真实执行起点，不直接提交未来 worktree 路径。
- 对 `use_worktree=true` 的仓库写任务，若 `cwd` 位于 repo 内子路径，运行时只接受能在目标 worktree 中解析到真实目录的路径；映射后的目录不存在时，任务会停在 enqueue 阶段并返回明确错误，不会继续派发到 worker。
- worker prompt 中，任务合同优先于 `focus_brief` 与 `resume_instruction`；后两者只提供背景或一次性恢复补充，不改写合同本身。
- worker prompt 会额外注入显式 `runtime_contract`，只复用运行时现有事实：`resource_mode`、实际 `working_directory`、可选 `task_cwd`、`worktree_root`、`branch`；其目的仅是收紧执行边界表达，不新增第二套任务协议。
- worker prompt 渲染 `context_refs` 时，会把 `tasks/...`、`generated/...`、`traces/...` 一类状态目录相对引用收紧为基于当前 `stateDir` 的稳定路径，避免执行面在 worktree 根目录下拿到不可解析的裸相对路径。

## 去重与替换

- 单轮去重键：`prompt + title + cwd + profile + provider + focusId + contract`
- active 任务去重键：`task.fingerprint`
- 语义冲突键：`task.semanticKey`
- manager 默认粗粒度派单；只有在目录边界独立且互不冲突时才应并发多个 `enqueue_task`
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

## Git 对账

- `Task.git` 只保留 repo-local 执行事实与 lifecycle 投影；默认直跑任务不会生成 `Task.git`
- `Task.git` 一旦存在，就必须同时满足：
  - 根级 `task.repoKey` 与 `task.branch` 也存在
  - `task.branch === task.git.branch`
  - `task.git.closureRequired` 明确声明该 task 是否进入 merge/cleanup 收尾闭环
- runtime 只允许复用 repo-local `./.worktrees/<branch-hash>` 下的既有 worktree；命中仓外旧路径会直接拒绝，不再沿用旧布局。
- git 收尾派生 closure task 时只信任根级 `task.repoKey` 作为主仓真相源；不会再从 `worktreePath` 反推 repoKey 或 repo root。
- git 收尾派生 closure task 会显式绑定主分支（当前协议为 `main`，若仓内不存在 `main` 才退回主仓当前分支），不再跟随主仓当下检出分支漂移。
- runtime 不再暴露 `record_task_git` 一类显式 git 状态写回 action，也不会采信 worker 主动上报的 `git_lifecycle`
- 启动 hydrate 与 snapshot persist 会基于文件系统 / git 真相源补做 repo-local reconcile：
  - 缺失 worktree 会收敛为 `cleaned=true`
  - review sentinel / merge 祖先关系会收敛为最新 lifecycle
  - 对账结果会回写到 `task.git.lifecycle` 与已有 `task.result.handoff.git.lifecycle`
- 因此 git closure 的真相源是 repo-local 文件系统与 git 状态；task / handoff / snapshot 只保留对账后的投影。
- 不再接受旧快照里的模糊 git task：缺少 `closureRequired`，或只有 `task.git` 没有根级 `repoKey + branch`，都会在 snapshot load 阶段直接拒绝。

## 结果约束

- 成功结果必须通过结构化 handoff 协议收敛
- worker 结束输出必须是单个结构化 JSON 对象：`{ reply, handoff }`
- manager 只消费压缩结果：结论、证据路径、归档路径、git lifecycle 等
- manager 对用户表达 task result 时，至少要让 `task title / id` 可定位；若存在 `stopReason`，失败 / 取消 / 停下说明里必须显式带出
- manager 对用户表达 task result 时，必须附任务归档链接；若无归档则明确写 `任务归档: 未生成`
- manager 查看的是 task 上的合同 digest，不是完整 worker prompt
- 不回灌 worker 原始长 prompt 或大段上下文

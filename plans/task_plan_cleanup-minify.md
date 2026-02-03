# 代码清理与内联计划

## 目标
- 按评审建议清理小文件与未用工具函数
- 保持最小化与可维护性，不引入新需求

## 范围
- commands/parser.ts 内联到 manager
- shared/sleep.ts 合并到 shared/utils.ts
- shared/utils.ts 移除未用导出
- types/usage.ts 合并到 types/common.ts
- 文档同步更新（commands.md）

## 步骤
1. 梳理命令解析与 sleep/utils/usage 的引用，确认删除范围。
2. 执行内联与合并，更新 import，删除空文件。
3. 更新 docs/design/commands.md 说明解析位置。
4. 运行 lint/tsc/test，确认无回归。

## 进度
- [x] 步骤 1
- [x] 步骤 2
- [x] 步骤 3
- [x] 步骤 4

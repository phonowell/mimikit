# Task Plan: webui-tasks-sidebar

## 目标
- 将 WebUI 的 Tasks 区域改为弹窗（modal），节省主界面空间

## 范围 / 文件
- src/webui/index.html（添加 Tasks 打开按钮与 dialog 结构）
- src/webui/layout.css（dialog 布局与尺寸、面板高度/滚动）
- src/webui/components.css（按钮与 header 细节样式）
- src/webui/dom.js / src/webui/app.js（选择器与绑定参数）
- src/webui/tasks.js（打开/关闭与轮询控制）

## 方案
- 在 header actions 加入 Tasks 按钮，点击打开 dialog
- dialog 内保留现有 tasks 面板结构，新增关闭按钮
- 轮询仅在 dialog 打开时启动，关闭时停止

## 步骤
1. 调整 HTML 结构：新增 Tasks 打开按钮与 dialog 容器。
2. 添加/更新样式：dialog/backdrop、任务面板与按钮样式。
3. 更新 JS 绑定：open/close 行为与轮询控制。

## 风险 / 假设
- 假设浏览器支持 dialog；否则退化为 open 属性展示。

## 状态
- ✓ HTML 已调整
- ✓ 样式已更新
- ✓ 逻辑已更新

# Task Plan: webui-semantic-html

## 目标
- 调整 WebUI HTML 标签语义化，并同步更新 JS/CSS

## 范围 / 文件
- src/webui/index.html
- src/webui/tasks.js
- src/webui/layout.css
- src/webui/components.css

## 方案
- 将无标题 section 改为 div/toolbar 语义
- dialog 使用 aria-labelledby 与触发按钮 aria-expanded/controls
- JS 同步管理 aria-expanded 状态

## 步骤
1. 更新 HTML 结构与 aria 关联。
2. 更新 JS 控制 aria-expanded 与关闭行为。
3. 调整 CSS 以匹配新结构。

## 状态
- ✓ HTML/ARIA 已更新
- ✓ JS 状态同步已更新
- ✓ CSS 已更新

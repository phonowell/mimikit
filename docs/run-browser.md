# @run_browser 使用文档

## 何时使用
- 需要访问网页、点击页面、填写表单、抓取页面信息、截图取证。
- 需要通过浏览器完成任务（登录、查询、下载、验证 UI）。

## 基本格式
- `@run_browser command="<子命令与参数>"`
- 推荐优先使用 `snapshot -i` 产生的 `@eN` 引用，降低选择器不稳定问题。

## 快速开始
1. `@run_browser command="open https://example.com"`
2. `@run_browser command="snapshot -i"`
3. `@run_browser command="click @e1"`
4. `@run_browser command="fill @e2 user@example.com"`
5. `@run_browser command="close"`

## 核心工作流
1. 导航：`open <url>`
2. 观察：`snapshot -i`
3. 交互：`click` / `fill` / `press` / `select`
4. 等待：`wait --load networkidle` 或 `wait --text <text>`
5. 复查：再次 `snapshot -i` 或 `get ...`

## 常用命令速查

### 导航
- `open <url>`：打开页面。
- `back` / `forward` / `reload`：后退、前进、刷新。
- `close`：关闭浏览器会话。

### 页面理解
- `snapshot`：完整可访问树。
- `snapshot -i`：仅交互元素（推荐）。
- `snapshot -c -d 3`：紧凑输出并限制深度。

### 交互
- `click <sel>` / `dblclick <sel>`：点击。
- `fill <sel> <text>`：清空并填充。
- `type <sel> <text>`：追加输入。
- `press <key>`：按键（如 `Enter`、`Control+a`）。
- `hover <sel>` / `focus <sel>`：悬停、聚焦。
- `check <sel>` / `uncheck <sel>`：复选框操作。
- `select <sel> <value...>`：下拉选择。
- `scroll down 500` / `scrollintoview <sel>`：滚动页面。
- `upload <sel> <files...>` / `download <sel> <path>`：上传、下载。

### 获取信息
- `get text <sel>` / `get html <sel>` / `get value <sel>`
- `get title` / `get url` / `get count <sel>`
- `is visible <sel>` / `is enabled <sel>` / `is checked <sel>`

### 等待与同步
- `wait <sel>`：等元素出现。
- `wait 2000`：固定等待（毫秒）。
- `wait --url <pattern>`：等 URL 匹配。
- `wait --load load|domcontentloaded|networkidle`
- `wait --text <text>`：等文本出现。

### 语义定位（推荐）
- `find role button click --name Submit`
- `find text "Sign In" click`
- `find label "Email" fill "user@example.com"`

### 调试与证据
- `screenshot` / `screenshot --full ./page.png`
- `pdf ./page.pdf`
- `console` / `errors`
- `highlight <sel>`

## 示例：表单提交
```text
@run_browser command="open https://example.com/form"
@run_browser command="snapshot -i"
@run_browser command="fill @e1 user@example.com"
@run_browser command="fill @e2 password123"
@run_browser command="click @e3"
@run_browser command="wait --load networkidle"
@run_browser command="snapshot -i"
```

## 示例：语义定位填写登录
```text
@run_browser command="open https://app.example.com/login"
@run_browser command="find label Email fill user@example.com"
@run_browser command="find label Password fill strong-password"
@run_browser command="find role button click --name Sign in"
@run_browser command="wait --url **/dashboard"
@run_browser command="get url"
```

## 会话与 JSON 输出
- 多会话：`--session <name>`。
- 机器可读：`--json`。

```text
@run_browser command="--session test1 open https://example.com"
@run_browser command="--session test1 snapshot -i --json"
@run_browser command="session list"
```

## 注意事项
- DOM 变化后，旧的 `@eN` 可能失效，需重新 `snapshot -i`。
- `wait 2000` 仅作兜底，优先使用条件等待（`--load`/`--url`/`--text`）。
- 输入含空格或特殊字符时，放在引号内。

// 用户最近新输入
// - CDATA 中为 messages 列表，按 time 倒序
{inputs}

// 待处理的新任务结果
// - CDATA 中为 tasks 列表，按 change_at 倒序
{results}

// 按需历史检索结果；仅在调用 M:query_history 后出现
// - CDATA 中为 messages 列表，按 time 倒序
{history_lookup}

// 当前任务列表；供参考，不主动提及
// - CDATA 中为 tasks 列表，按 create_at 倒序
{tasks}

// 环境信息；供参考，不主动提及
{environment}

// 你的身份信息；供参考，不主动提及
{persona}

// 用户画像；供参考，不主动提及
{user_profile}

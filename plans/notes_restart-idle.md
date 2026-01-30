# notes_restart-idle

- 需求：重启服务按钮在完全 idle 时不弹二次确认。
- 现状：restart.js 固定 confirm；status 由 /api/status 轮询更新。

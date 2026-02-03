# notes_third_party_impl

- 供应商静态资源路径：已改为 /vendor/marked/marked.esm.js 与 /vendor/purify/purify.es.mjs，并同步 ./src/webui/markdown.js
- rotating-file-stream 无直接“按总字节上限”清理；使用 maxFiles=50 近似 500MB（10MB * 50）
- fastify bodyLimit 对齐原 MAX_BODY_BYTES=64KB
- AskUserQuestion tool 在 code mode 不可用，改用直接询问确认方案

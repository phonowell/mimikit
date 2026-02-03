# task_plan_third_party_impl

- ✓ 1/5 依赖与版本：fastify/@fastify/static/@iarna/toml/rotating-file-stream/write-file-atomic（package.json + pnpm-lock）
- ✓ 2/5 HTTP 服务替换：./src/http/index.ts（fastify 路由/静态资源/错误处理），删除 ./src/http/handler.ts ./src/http/static.ts ./src/http/utils.ts；同步 ./src/webui/markdown.js vendor 路径
- ✓ 3/5 TOML 解析替换：./src/llm/openai.ts 使用 @iarna/toml，保留字段映射与错误日志
- ✓ 4/5 原子写替换：./src/fs/atomic.ts 使用 write-file-atomic，保留 backup 逻辑；./src/fs/json.ts 对齐调用
- ✓ 5/5 日志轮转替换：./src/log/append.ts 使用 rotating-file-stream（size/interval/compress/retention），适配现有 JSONL 格式

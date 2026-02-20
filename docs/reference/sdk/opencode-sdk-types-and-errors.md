# OpenCode SDK · 类型与错误处理

## 四、核心类型定义

### Session

```typescript
interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  agent?: string;
  cwd?: string;
  status: "active" | "paused" | "completed" | "error";
  metadata?: Record<string, unknown>;
  messageCount: number;
}
```

### Message

```typescript
interface Message {
  id: string;
  sessionId: string;
  role: "user" | "agent" | "system" | "tool";
  content: string;
  parts: Part[];
  createdAt: string;
  attachments?: Attachment[];
}

type Part =
  | TextPart
  | ToolCallPart
  | ToolResultPart
  | ReasoningPart
  | ImagePart;

interface TextPart {
  type: "text";
  text: string;
}

interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

interface ReasoningPart {
  type: "reasoning";
  reasoning: string;
}

interface ImagePart {
  type: "image";
  mimeType: string;
  data: string; // base64
}
```

### Attachment

```typescript
interface Attachment {
  path: string;
  type: "file" | "image" | "directory";
  name?: string;
  size?: number;
}
```

---

## 五、错误处理

```typescript
// 方式 1: throwOnError = false（默认）
const result = await client.session.get({
  path: { id: "invalid-id" },
});

if (result.error) {
  console.error("Error:", result.error.message);
  console.error("Status:", result.response.status);
} else {
  console.log("Session:", result.data);
}

// 方式 2: throwOnError = true
const clientStrict = createOpencode({
  throwOnError: true,
});

try {
  const session = await clientStrict.session.get({
    path: { id: "invalid-id" },
  });
} catch (error) {
  console.error("Failed:", error.message);
}
```

---


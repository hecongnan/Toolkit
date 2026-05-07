interface DeepSeekChunk {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: unknown;
  error?: { message?: string };
}

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface StreamDeepSeekOptions {
  model: string;
  messages: DeepSeekMessage[];
  signal?: AbortSignal;
  maxTokens?: number;
  onDelta: (text: string) => void;
}

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function deepSeekEndpoint(): string {
  const baseURL =
    process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.deepseek.com";
  return `${baseURL.replace(/\/+$/, "")}/chat/completions`;
}

export function getDeepSeekApiKey(): string | null {
  return (
    process.env.ANTHROPIC_AUTH_TOKEN?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim() ||
    null
  );
}

export async function streamDeepSeekChat({
  model,
  messages,
  signal,
  maxTokens = 8192,
  onDelta,
}: StreamDeepSeekOptions): Promise<{ usage: unknown; stopReason: string | null }> {
  const apiKey = getDeepSeekApiKey();
  if (!apiKey) {
    throw new Error("服务端缺少 ANTHROPIC_AUTH_TOKEN，请在 .env.local 中配置");
  }

  const response = await fetch(deepSeekEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      max_tokens: maxTokens,
      messages,
    }),
    signal,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`DeepSeek API ${response.status}: ${detail}`);
  }
  if (!response.body) {
    throw new Error("DeepSeek API 没有返回流式响应体");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let stopReason: string | null = null;
  let usage: unknown = null;
  let streamDone = false;

  while (!streamDone) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf("\n\n");
    while (idx !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      idx = buffer.indexOf("\n\n");

      const dataLines = chunk
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      for (const data of dataLines) {
        if (!data) continue;
        if (data === "[DONE]") {
          streamDone = true;
          break;
        }

        const parsedChunk = JSON.parse(data) as DeepSeekChunk;
        if (parsedChunk.error?.message) {
          throw new Error(parsedChunk.error.message);
        }
        usage = parsedChunk.usage ?? usage;

        for (const choice of parsedChunk.choices ?? []) {
          const text = choice.delta?.content;
          if (text) onDelta(text);
          if (choice.finish_reason) {
            stopReason = choice.finish_reason;
          }
        }
      }
    }
  }

  return { usage, stopReason };
}

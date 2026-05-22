// Thin client for Databricks-hosted Claude serving endpoints.
// The endpoint is OpenAI chat-completions compatible.

const DEFAULT_BASE_URL =
  "https://adb-1673756548389184.4.azuredatabricks.net/serving-endpoints";
const DEFAULT_MODEL = "databricks-claude-sonnet-4-6";

export interface ContentBlock {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

/**
 * Sends a single user message (text and/or images) to the Databricks Claude
 * endpoint and returns the assistant's text response.
 */
export async function callDatabricksClaude(
  content: ContentBlock[],
  maxTokens = 5000
): Promise<string> {
  const token = process.env.DATABRICKS_TOKEN;
  if (!token) {
    throw new Error("DATABRICKS_TOKEN is not configured");
  }

  const baseUrl = (process.env.DATABRICKS_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.DATABRICKS_MODEL || DEFAULT_MODEL;

  const res = await fetch(`${baseUrl}/${model}/invocations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content }],
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Databricks request failed (${res.status}): ${detail.slice(0, 500)}`);
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message?.content;

  if (typeof message === "string") return message;
  if (Array.isArray(message)) {
    return message.map((m: { text?: string }) => m.text ?? "").join("");
  }

  throw new Error("Unexpected response shape from Databricks endpoint");
}

/**
 * Extracts a JSON object from a model response that may be wrapped in prose
 * or markdown code fences.
 */
export function parseJsonResponse<T = Record<string, unknown>>(raw: string): T {
  let text = raw.trim();

  // Strip ```json ... ``` or ``` ... ``` fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  // Fall back to the outermost { ... }
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  }

  return JSON.parse(text) as T;
}

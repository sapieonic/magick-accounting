import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseJsonResponse, callDatabricksClaude } from "@/lib/databricks";
import type { ContentBlock } from "@/lib/databricks";

describe("parseJsonResponse", () => {
  it("parses plain JSON", () => {
    expect(parseJsonResponse('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
  });

  it("strips ```json fenced``` blocks", () => {
    const raw = '```json\n{"a":1}\n```';
    expect(parseJsonResponse(raw)).toEqual({ a: 1 });
  });

  it("strips bare ``` fenced``` blocks", () => {
    const raw = "```\n{\"a\":2}\n```";
    expect(parseJsonResponse(raw)).toEqual({ a: 2 });
  });

  it("extracts JSON embedded in prose", () => {
    const raw = 'Here is the data you asked for: {"a":3,"nested":{"x":1}} hope it helps!';
    expect(parseJsonResponse(raw)).toEqual({ a: 3, nested: { x: 1 } });
  });

  it("trims surrounding whitespace", () => {
    expect(parseJsonResponse('   {"a":4}   ')).toEqual({ a: 4 });
  });

  it("throws on non-JSON content", () => {
    expect(() => parseJsonResponse("this is not json at all")).toThrow();
  });
});

describe("callDatabricksClaude", () => {
  const content: ContentBlock[] = [{ type: "text", text: "hello" }];
  const ORIGINAL = process.env.DATABRICKS_TOKEN;
  const ORIGINAL_BASE = process.env.DATABRICKS_BASE_URL;
  const ORIGINAL_MODEL = process.env.DATABRICKS_MODEL;

  beforeEach(() => {
    process.env.DATABRICKS_TOKEN = "test-token";
    delete process.env.DATABRICKS_BASE_URL;
    delete process.env.DATABRICKS_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL === undefined) delete process.env.DATABRICKS_TOKEN;
    else process.env.DATABRICKS_TOKEN = ORIGINAL;
    if (ORIGINAL_BASE === undefined) delete process.env.DATABRICKS_BASE_URL;
    else process.env.DATABRICKS_BASE_URL = ORIGINAL_BASE;
    if (ORIGINAL_MODEL === undefined) delete process.env.DATABRICKS_MODEL;
    else process.env.DATABRICKS_MODEL = ORIGINAL_MODEL;
  });

  it("throws when DATABRICKS_TOKEN is missing", async () => {
    delete process.env.DATABRICKS_TOKEN;
    await expect(callDatabricksClaude(content)).rejects.toThrow(
      "DATABRICKS_TOKEN is not configured"
    );
  });

  it("posts to the correct URL and returns string content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "the answer" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callDatabricksClaude(content, 1234);
    expect(result).toBe("the answer");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://adb-1673756548389184.4.azuredatabricks.net/serving-endpoints/databricks-claude-sonnet-4-6/invocations"
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body.max_tokens).toBe(1234);
    expect(body.messages).toEqual([{ role: "user", content }]);
  });

  it("honors DATABRICKS_BASE_URL and DATABRICKS_MODEL overrides (strips trailing slash)", async () => {
    process.env.DATABRICKS_BASE_URL = "https://custom.example.com/api/";
    process.env.DATABRICKS_MODEL = "my-model";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "x" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await callDatabricksClaude(content);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://custom.example.com/api/my-model/invocations"
    );
  });

  it("joins array content blocks", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: [{ text: "Hello " }, { text: "world" }, { other: "ignored" }],
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callDatabricksClaude(content);
    expect(result).toBe("Hello world");
  });

  it("throws on a non-ok response with status and detail", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "internal error",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(callDatabricksClaude(content)).rejects.toThrow(
      "Databricks request failed (500): internal error"
    );
  });

  it("throws on an unexpected response shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 12345 } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(callDatabricksClaude(content)).rejects.toThrow(
      "Unexpected response shape from Databricks endpoint"
    );
  });

  it("defaults maxTokens to 5000", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "x" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await callDatabricksClaude(content);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(5000);
  });
});

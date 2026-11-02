import "server-only";
import { META_BASE_URL, metaApiKey } from "@/lib/config";

/**
 * Minimal typed client for the Meta Model API Responses endpoint (POST /v1/responses).
 * Requests are streamed (server-sent events) so long generations are not cut off by the
 * non-streaming time limit, and progress can be reported while the model works.
 */

export type InputContent =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

export type InputMessage = {
  type: "message";
  role: "user" | "developer" | "system" | "assistant";
  content: InputContent[];
};

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export type JsonSchemaFormat = {
  type: "json_schema";
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type CreateResponseParams = {
  model: string;
  input: InputMessage[];
  instructions?: string;
  reasoning?: { effort?: ReasoningEffort; summary?: "auto" | "concise" | "detailed" };
  text?: { format: JsonSchemaFormat };
  maxOutputTokens?: number;
  metadata?: Record<string, string>;
};

export type StreamProgress = {
  outputChars: number;
  reasoningSummary?: string;
};

export type ResponseResult = {
  id: string;
  model: string;
  status: string;
  outputText: string;
  reasoningSummary: string[];
  usage: Record<string, unknown> | null;
  durationMs: number;
};

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason);
    });
  });
}

async function readError(res: Response): Promise<MetaApiError> {
  let message = `${res.status} ${res.statusText}`;
  let code: string | null = null;
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: string | null; type?: string } };
    if (body.error?.message) message = `${res.status}: ${body.error.message}`;
    code = body.error?.code ?? body.error?.type ?? null;
  } catch {
    // Body was not JSON; keep the status line.
  }
  return new MetaApiError(message, res.status, code, RETRYABLE_STATUS.has(res.status));
}

/** Parses an SSE byte stream into (event, data) pairs. */
async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, "");
        let event = "message";
        const data: string[] = [];
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
        }
        if (data.length) yield { event, data: data.join("\n") };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

type RawEvent = {
  type?: string;
  delta?: string;
  text?: string;
  response?: {
    id?: string;
    model?: string;
    status?: string;
    error?: { message?: string; code?: string } | null;
    incomplete_details?: { reason?: string } | null;
    usage?: Record<string, unknown>;
    output?: Array<{
      type: string;
      summary?: Array<{ text: string }>;
      content?: Array<{ type: string; text?: string }>;
    }>;
  };
  error?: { message?: string; code?: string };
  message?: string;
};

/** Raw text-lane events, for consumers such as the SAM parser. */
export type TextLaneEvent =
  | { type: "response.output_text.delta"; item_id: string; output_index: number; content_index: number; delta: string }
  | { type: "response.output_text.done"; item_id: string; output_index: number; content_index: number; text: string }
  | { type: "response.completed" };

async function streamOnce(
  params: CreateResponseParams,
  opts: { signal?: AbortSignal; onProgress?: (p: StreamProgress) => void; onTextEvent?: (e: TextLaneEvent) => void },
): Promise<ResponseResult> {
  const started = Date.now();
  const body: Record<string, unknown> = {
    model: params.model,
    input: params.input,
    stream: true,
  };
  if (params.instructions) body.instructions = params.instructions;
  if (params.reasoning) body.reasoning = params.reasoning;
  if (params.text) body.text = params.text;
  if (params.maxOutputTokens) body.max_output_tokens = params.maxOutputTokens;
  if (params.metadata) body.metadata = params.metadata;

  const res = await fetch(`${META_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${metaApiKey()}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw await readError(res);

  let outputText = "";
  let summaryLive = "";
  let final: RawEvent["response"] | undefined;

  for await (const { event, data } of sseEvents(res.body)) {
    if (data === "[DONE]") break;
    let ev: RawEvent;
    try {
      ev = JSON.parse(data) as RawEvent;
    } catch {
      continue;
    }
    const type = ev.type ?? event;
    switch (type) {
      case "response.output_text.delta":
        outputText += ev.delta ?? "";
        opts.onTextEvent?.(ev as TextLaneEvent);
        opts.onProgress?.({ outputChars: outputText.length, reasoningSummary: summaryLive || undefined });
        break;
      case "response.output_text.done":
        opts.onTextEvent?.(ev as TextLaneEvent);
        break;
      case "response.reasoning_summary_text.delta":
        summaryLive += ev.delta ?? "";
        opts.onProgress?.({ outputChars: outputText.length, reasoningSummary: summaryLive });
        break;
      case "response.reasoning_summary_text.done":
        summaryLive += "\n";
        break;
      case "response.completed":
      case "response.incomplete":
      case "response.failed":
        final = ev.response;
        if (type === "response.completed") opts.onTextEvent?.({ type: "response.completed" });
        break;
      case "error": {
        const msg = ev.error?.message ?? ev.message ?? "stream error";
        throw new MetaApiError(`Stream error: ${msg}`, 500, ev.error?.code ?? null, true);
      }
    }
  }

  if (!final) throw new MetaApiError("Stream ended without a final response event", 502, null, true);
  if (final.status === "failed") {
    throw new MetaApiError(`Response failed: ${final.error?.message ?? "unknown error"}`, 500, final.error?.code ?? null, true);
  }
  if (final.status === "incomplete") {
    throw new MetaApiError(
      `Response incomplete (${final.incomplete_details?.reason ?? "unknown reason"})`,
      422,
      "incomplete",
      false,
    );
  }

  const reasoningSummary: string[] = [];
  let finalText = "";
  for (const item of final.output ?? []) {
    if (item.type === "reasoning") for (const s of item.summary ?? []) if (s.text) reasoningSummary.push(s.text);
    if (item.type === "message") for (const c of item.content ?? []) if (c.type === "output_text") finalText += c.text ?? "";
  }

  return {
    id: final.id ?? "",
    model: final.model ?? params.model,
    status: final.status ?? "completed",
    outputText: finalText || outputText,
    reasoningSummary,
    usage: final.usage ?? null,
    durationMs: Date.now() - started,
  };
}

/** Creates a response with exponential backoff + jitter on 429/5xx (per the Meta error-handling guide). */
export async function createResponse(
  params: CreateResponseParams,
  opts: {
    signal?: AbortSignal;
    onProgress?: (p: StreamProgress) => void;
    onTextEvent?: (e: TextLaneEvent) => void;
    maxAttempts?: number;
  } = {},
): Promise<ResponseResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let delay = 800;
  for (let attempt = 1; ; attempt++) {
    try {
      return await streamOnce(params, opts);
    } catch (err) {
      const retryable =
        (err instanceof MetaApiError && err.retryable) ||
        (err instanceof TypeError && /fetch failed|network|socket/i.test(err.message));
      if (!retryable || attempt >= maxAttempts || opts.signal?.aborted) throw err;
      await sleep(delay + Math.random() * delay, opts.signal);
      delay *= 2;
    }
  }
}

/** Calls Muse Spark with a JSON-schema text format and returns the parsed JSON. */
export async function createStructuredResponse<T>(
  params: Omit<CreateResponseParams, "text"> & { schemaName: string; schema: Record<string, unknown> },
  parse: (value: unknown) => T,
  opts: { signal?: AbortSignal; onProgress?: (p: StreamProgress) => void } = {},
): Promise<{ value: T; result: ResponseResult }> {
  const { schemaName, schema, ...rest } = params;
  // Decoding is schema-constrained, but app-level validation (Zod) is stricter
  // (ranges, file-name rules), so one retry is allowed when validation fails.
  for (let attempt = 1; ; attempt++) {
    const result = await createResponse(
      { ...rest, text: { format: { type: "json_schema", name: schemaName, schema } } },
      opts,
    );
    try {
      return { value: parse(JSON.parse(extractJson(result.outputText))), result };
    } catch (err) {
      if (attempt >= 2) {
        const detail = err instanceof Error ? err.message.slice(0, 600) : String(err);
        throw new MetaApiError(`Model output for ${schemaName} failed validation: ${detail}`, 502, "invalid_output");
      }
    }
  }
}

/** Structured output is schema-constrained, but tolerate a stray code fence just in case. */
function extractJson(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fence ? fence[1] : trimmed;
}

export function imageDataUrl(png: Buffer, mime = "image/png"): string {
  return `data:${mime};base64,${png.toString("base64")}`;
}

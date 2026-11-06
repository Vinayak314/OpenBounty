const { getAiConfig } = require("../../config/ai");

class AiError extends Error {
  constructor(message, { code = "ai_error", status, retryable = false } = {}) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

// 401/403: bad key; 402: out of credits; 400/422: request rejected; 503 "no provider" is deterministic, so not retried.
function classifyFailure(status, detail) {
  if (status === 401 || status === 403) return { code: "ai_auth", message: "The AI service rejected the API key.", retryable: false };
  if (status === 402) return { code: "ai_credits", message: "The AI service has no credits left.", retryable: false };
  if (status === 400 || status === 404 || status === 413 || status === 422) {
    return { code: "ai_bad_request", message: "The AI service rejected the request.", retryable: false };
  }
  if (status === 429) return { code: "rate_limited", message: "The AI service is rate limited. Try again shortly.", retryable: true };
  if (status === 503 && /no_provider/i.test(detail)) {
    return { code: "upstream_error", message: "No 0G provider is available for this model and trust mode.", retryable: false };
  }
  return { code: "upstream_error", message: "The AI service returned an error.", retryable: status >= 500 };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// All model inference goes through 0G Private Computer (OpenAI-compatible router).
// Returns { text, requestId, provider, trace, model, usage, finishReason }.
async function chatCompletion({ messages, maxTokens, temperature = 0.2, signal } = {}, config = getAiConfig()) {
  if (!config.apiKey) throw new AiError("The AI service is not configured.", { code: "not_configured" });

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` };
  if (config.trustMode) headers["X-0G-Provider-Trust-Mode"] = config.trustMode;
  const body = JSON.stringify({
    model: config.model,
    messages,
    temperature,
    max_tokens: maxTokens || config.maxOutputTokens,
    stream: false,
  });

  let lastError;
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    if (attempt > 0) await sleep(Math.min(500 * 2 ** (attempt - 1), 4000) + Math.random() * 250);
    const timeout = AbortSignal.timeout(config.timeoutMs);
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      // The router sends "<trace id>, <request uuid>"; the last value matches body.x_0g_trace.request_id.
      const headerRequestId = (response.headers.get("x-request-id") || "").split(",").pop().trim();
      if (!response.ok) {
        // Status and the router's error code (never the prompt) go to the log so operators can diagnose outages.
        const detail = await response.json().then((body) => String(body?.error?.code || body?.error?.type || body?.error?.message || "").slice(0, 120)).catch(() => "");
        console.error(`0G request failed: HTTP ${response.status}${detail ? ` (${detail})` : ""}`);
        const known = classifyFailure(response.status, detail);
        lastError = new AiError(known.message, { code: known.code, status: response.status, retryable: known.retryable });
        if (!known.retryable) throw lastError;
        continue;
      }
      const data = await response.json();
      const choice = data?.choices?.[0];
      const text = typeof choice?.message?.content === "string" ? choice.message.content.trim() : "";
      if (!text) throw new AiError("The AI service returned an empty answer.", { code: "empty_output" });
      const provider = String(data?.x_0g_trace?.provider || response.headers.get("x-provider") || "").slice(0, 200);
      return {
        text,
        requestId: data?.x_0g_trace?.request_id || headerRequestId || (typeof data.id === "string" ? data.id : ""),
        provider,
        // Transport/trust facts reported by the router. Traceability only; not proof the output is correct.
        trace: {
          provider,
          e2ee: String(response.headers.get("x-0g-e2ee") || data?.x_0g_trace?.e2ee || "").slice(0, 40),
          trustMode: config.trustMode || "",
          promptTokens: Number(data?.usage?.prompt_tokens) || 0,
          completionTokens: Number(data?.usage?.completion_tokens) || 0,
        },
        model: typeof data.model === "string" ? data.model : config.model,
        usage: data.usage || null,
        finishReason: choice.finish_reason || "",
      };
    } catch (error) {
      if (error instanceof AiError) {
        if (!error.retryable) throw error;
        lastError = error;
        continue;
      }
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      lastError = new AiError(timedOut ? "The AI service timed out." : "The AI service is unreachable.", {
        code: timedOut ? "timeout" : "unreachable", retryable: true,
      });
    }
  }
  throw lastError || new AiError("The AI service failed.");
}

module.exports = { chatCompletion, AiError };

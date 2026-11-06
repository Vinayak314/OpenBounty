// Central AI configuration. Everything is read lazily so tests/env changes apply.
const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

function getAiConfig(env = process.env) {
  return {
    enabled: env.AI_ENABLED !== "false",
    baseUrl: (env.ZEROG_BASE_URL || "https://router-api.0g.ai/v1").replace(/\/+$/, ""),
    apiKey: env.ZEROG_API_KEY || "",
    model: env.ZEROG_MODEL || "glm-5.2",
    // "private" asks for TEE-only providers, but the live spike found none for glm-5.2 (503
    // no_provider_for_trust_mode). Default to no header; set ZEROG_TRUST_MODE=private for a model that supports it.
    trustMode: env.ZEROG_TRUST_MODE || "",
    timeoutMs: int(env.ZEROG_TIMEOUT_MS, 60000),
    maxRetries: Math.min(int(env.ZEROG_MAX_RETRIES, 2), 4),
    maxOutputTokens: int(env.AI_MAX_OUTPUT_TOKENS, 2500),
    // Bounded context package limits.
    maxHistoryMessages: int(env.AI_MAX_HISTORY_MESSAGES, 12),
    maxContextChars: int(env.AI_MAX_CONTEXT_CHARS, 24000),
    // Hard bound on a whole review prompt (criteria, PR text, issues and diff together).
    maxPromptChars: int(env.AI_MAX_PROMPT_CHARS, 60000),
    autoReviewsPerHour: int(env.AI_AUTO_REVIEWS_PER_HOUR, 20),
    // Per-user and per-project rate limits (sliding window, 1 minute).
    userRequestsPerMinute: int(env.AI_USER_RPM, 4),
    projectRequestsPerMinute: int(env.AI_PROJECT_RPM, 12),
    maxQueueDepth: int(env.AI_MAX_QUEUE_DEPTH, 5),
  };
}

module.exports = { getAiConfig };

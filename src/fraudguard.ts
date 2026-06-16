import { FraudGuardMcpError } from "./errors.js";
import { logger } from "./logger.js";

const DEFAULT_BASE_URL = "https://api.fraudguard.io";
const REQUEST_TIMEOUT_MS = 30_000;

type JsonObject = Record<string, unknown>;

export class FraudGuardClient {
  constructor(
    private readonly baseUrl: URL,
    private readonly username: string,
    private readonly password: string
  ) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): FraudGuardClient {
    const username = env.FRAUDGUARD_API_USERNAME;
    const password = env.FRAUDGUARD_API_PASSWORD;
    const baseUrl = env.FRAUDGUARD_API_BASE_URL ?? DEFAULT_BASE_URL;

    if (!username || !password) {
      throw new FraudGuardMcpError(
        "missing_credentials",
        "Missing FRAUDGUARD_API_USERNAME or FRAUDGUARD_API_PASSWORD."
      );
    }

    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(baseUrl);
    } catch {
      throw new FraudGuardMcpError(
        "invalid_configuration",
        "FRAUDGUARD_API_BASE_URL must be a valid URL."
      );
    }

    return new FraudGuardClient(parsedBaseUrl, username, password);
  }

  checkIp(ip: string): Promise<JsonObject> {
    return this.postJson("/ace/v2/ip/check", { ip });
  }

  bulkCheckIps(ips: string[]): Promise<JsonObject> {
    return this.postJson("/ace/v2/ip/check/bulk", { ips });
  }

  private async postJson(path: string, body: JsonObject): Promise<JsonObject> {
    const startedAt = performance.now();
    const url = new URL(path, this.baseUrl);
    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`, "utf8").toString("base64")}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(body),
        signal: timeoutSignal
      });
    } catch (error) {
      const durationMs = elapsedMs(startedAt);
      logger.error("fraudguard_request_failed", {
        path,
        duration_ms: durationMs,
        error_code: isTimeoutError(error) ? "network_timeout" : "network_error"
      });

      if (isTimeoutError(error)) {
        throw new FraudGuardMcpError(
          "network_timeout",
          `FraudGuard API request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`
        );
      }

      throw new FraudGuardMcpError("network_error", "Network error calling FraudGuard API.");
    }

    const durationMs = elapsedMs(startedAt);
    const rawBody = await response.text();
    let parsedBody: JsonObject;
    let requestId: string | undefined;

    try {
      parsedBody = parseJsonBody(rawBody, response.ok, response.status, path);
      requestId = extractRequestId(parsedBody, response.headers);
    } finally {
      logger.info("fraudguard_request", {
        path,
        status_code: response.status,
        duration_ms: durationMs,
        request_id: requestId
      });
    }

    if (!response.ok) {
      throw mapHttpError(response.status, requestId);
    }

    return parsedBody;
  }
}

function parseJsonBody(rawBody: string, requireJson: boolean, statusCode: number, path: string): JsonObject {
  if (!rawBody) {
    if (requireJson) {
      throw new FraudGuardMcpError(
        "invalid_json_response",
        "FraudGuard API returned an empty response where JSON was expected.",
        statusCode
      );
    }

    return {};
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as JsonObject;
    }

    if (requireJson) {
      throw new FraudGuardMcpError(
        "invalid_json_response",
        "FraudGuard API returned JSON that was not an object.",
        statusCode
      );
    }

    return { response: parsed };
  } catch (error) {
    if (error instanceof FraudGuardMcpError) {
      throw error;
    }

    if (requireJson) {
      throw new FraudGuardMcpError(
        "invalid_json_response",
        "FraudGuard API returned invalid JSON.",
        statusCode
      );
    }

    logger.warn("fraudguard_non_json_error_response", { path, status_code: statusCode });
    return {};
  }
}

function mapHttpError(statusCode: number, requestId?: string): FraudGuardMcpError {
  if (statusCode === 401) {
    return new FraudGuardMcpError(
      "unauthorized",
      "FraudGuard API returned 401 Unauthorized. Check FRAUDGUARD_API_USERNAME and FRAUDGUARD_API_PASSWORD.",
      statusCode,
      requestId
    );
  }

  if (statusCode === 403) {
    return new FraudGuardMcpError(
      "forbidden",
      "FraudGuard API returned 403 Forbidden. The credentials may not have access to ACE v2 IP Intelligence.",
      statusCode,
      requestId
    );
  }

  if (statusCode === 429) {
    return new FraudGuardMcpError(
      "rate_limited",
      "FraudGuard API returned 429 Rate Limited. REST API rate limits remain authoritative for MCP usage.",
      statusCode,
      requestId
    );
  }

  if (statusCode >= 500) {
    return new FraudGuardMcpError(
      "fraudguard_server_error",
      `FraudGuard API returned ${statusCode}.`,
      statusCode,
      requestId
    );
  }

  return new FraudGuardMcpError(
    "fraudguard_api_error",
    `FraudGuard API returned ${statusCode}.`,
    statusCode,
    requestId
  );
}

function extractRequestId(body: JsonObject, headers: Headers): string | undefined {
  const headerRequestId =
    headers.get("x-request-id") ??
    headers.get("x-correlation-id") ??
    headers.get("cf-ray") ??
    undefined;

  const metadata = body.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const requestId = (metadata as JsonObject).request_id;
    if (typeof requestId === "string" && requestId.length > 0) {
      return requestId;
    }
  }

  const requestId = body.request_id;
  if (typeof requestId === "string" && requestId.length > 0) {
    return requestId;
  }

  return headerRequestId;
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

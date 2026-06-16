export type FraudGuardErrorCode =
  | "missing_credentials"
  | "invalid_configuration"
  | "invalid_input"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "fraudguard_server_error"
  | "fraudguard_api_error"
  | "network_timeout"
  | "network_error"
  | "invalid_json_response";

export class FraudGuardMcpError extends Error {
  constructor(
    public readonly code: FraudGuardErrorCode,
    message: string,
    public readonly statusCode?: number,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = "FraudGuardMcpError";
  }
}

export function isFraudGuardMcpError(error: unknown): error is FraudGuardMcpError {
  return error instanceof FraudGuardMcpError;
}

export function mapUnknownError(error: unknown): FraudGuardMcpError {
  if (isFraudGuardMcpError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new FraudGuardMcpError("network_error", error.message);
  }

  return new FraudGuardMcpError("network_error", "Unknown error");
}

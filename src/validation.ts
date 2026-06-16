import { FraudGuardMcpError } from "./errors.js";

export const MAX_BULK_VALUES = 100;

export function validateSingleIp(value: unknown): string {
  if (Array.isArray(value)) {
    throw new FraudGuardMcpError("invalid_input", "ip must be a single string, not an array.");
  }

  if (typeof value !== "string") {
    throw new FraudGuardMcpError("invalid_input", "ip is required and must be a string.");
  }

  const ip = value.trim();

  if (!ip) {
    throw new FraudGuardMcpError("invalid_input", "ip is required and must be non-empty.");
  }

  rejectCidrRange(ip, "ip");

  return ip;
}

export function validateBulkIps(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new FraudGuardMcpError("invalid_input", "ips is required and must be an array.");
  }

  const ips = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const nonStringCount = value.length - value.filter((item) => typeof item === "string").length;

  if (nonStringCount > 0) {
    throw new FraudGuardMcpError("invalid_input", "ips must contain only strings.");
  }

  if (ips.length > MAX_BULK_VALUES) {
    throw new FraudGuardMcpError(
      "invalid_input",
      `bulk_check_ips accepts at most ${MAX_BULK_VALUES} non-empty submitted values.`
    );
  }

  ips.forEach((ip, index) => rejectCidrRange(ip, `ips[${index}]`));

  return ips;
}

function rejectCidrRange(value: string, field: string): void {
  if (value.includes("/")) {
    throw new FraudGuardMcpError("invalid_input", `${field} must not be a CIDR range.`);
  }
}

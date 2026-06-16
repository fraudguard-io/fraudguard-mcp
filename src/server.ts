import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import { mapUnknownError } from "./errors.js";
import { FraudGuardClient } from "./fraudguard.js";
import { validateBulkIps, validateSingleIp } from "./validation.js";

const SERVER_NAME = "FraudGuard MCP Server";
const SERVER_VERSION = "0.1.0";

type JsonObject = Record<string, unknown>;

export function createFraudGuardMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });

  server.registerTool(
    "check_ip",
    {
      title: "Check IP",
      description:
        "Check, research, investigate, analyze, or look up a single IPv4 address, IPv6 address, or resolvable hostname using FraudGuard ACE v2 IP Intelligence. Use this for IP reputation, IP risk, threat intelligence, abuse, attack activity, proxy/VPN/hosting, geolocation, allow/block recommendations, and observed malicious behavior questions. Returns FraudGuard's recommendation, risk level, classification, observed activity, reasons, customer whitelist/blacklist/geoblock context, infrastructure, network, and geography data.",
      inputSchema: {
        ip: z
          .string()
          .describe("A single IPv4 address, IPv6 address, or resolvable hostname. CIDR ranges are not accepted.")
      },
      annotations: {
        readOnlyHint: true
      }
    },
    async ({ ip }) => {
      try {
        const validatedIp = validateSingleIp(ip);
        const response = await FraudGuardClient.fromEnv().checkIp(validatedIp);
        return successResult(response);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "bulk_check_ips",
    {
      title: "Bulk Check IPs",
      description:
        "Check, research, investigate, analyze, or look up multiple IPv4 addresses, IPv6 addresses, or resolvable hostnames using FraudGuard ACE v2 Bulk IP Intelligence. Use this for bulk IP reputation, IP risk triage, threat intelligence review, blocklist decisions, allow/block recommendations, and comparing observed malicious behavior across IPs. Returns one ACE v2 result per accepted unique resolved IP lookup.",
      inputSchema: {
        ips: z
          .array(z.string())
          .describe(
            "Array of IPv4 addresses, IPv6 addresses, or resolvable hostnames. CIDR ranges are not accepted. Maximum 100 submitted values per request."
          )
      },
      annotations: {
        readOnlyHint: true
      }
    },
    async ({ ips }) => {
      try {
        const validatedIps = validateBulkIps(ips);
        const response = await FraudGuardClient.fromEnv().bulkCheckIps(validatedIps);
        return successResult(response);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  return server;
}

function successResult(response: JsonObject): CallToolResult {
  return {
    structuredContent: response,
    content: [
      {
        type: "text",
        text: JSON.stringify(response, null, 2)
      }
    ]
  };
}

function errorResult(error: unknown): CallToolResult {
  const mapped = mapUnknownError(error);
  const payload: JsonObject = {
    error: {
      code: mapped.code,
      message: mapped.message
    }
  };

  if (mapped.statusCode !== undefined) {
    (payload.error as JsonObject).status_code = mapped.statusCode;
  }

  if (mapped.requestId !== undefined) {
    (payload.error as JsonObject).request_id = mapped.requestId;
  }

  return {
    isError: true,
    structuredContent: payload,
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

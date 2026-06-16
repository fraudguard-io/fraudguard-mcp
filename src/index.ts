#!/usr/bin/env node

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import { createFraudGuardMcpServer } from "./server.js";
import { logger } from "./logger.js";

type TransportMode = "stdio" | "http";

interface CliOptions {
  transport: TransportMode;
  host: string;
  port: number;
  path: string;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2), process.env);

  if (options.transport === "http") {
    await runHttp(options);
    return;
  }

  await runStdio();
}

async function runStdio(): Promise<void> {
  const server = createFraudGuardMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runHttp(options: CliOptions): Promise<void> {
  const app = createMcpExpressApp({ host: options.host });

  app.post(options.path, async (req: Request, res: Response) => {
    const server = createFraudGuardMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error("mcp_http_request_failed", {
        error: error instanceof Error ? error.message : "Unknown error"
      });

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        });
      }
    } finally {
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  });

  app.get(options.path, (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    });
  });

  app.delete(options.path, (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    });
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  const listener = app.listen(options.port, options.host, () => {
    logger.info("mcp_http_server_started", {
      host: options.host,
      port: options.port,
      path: options.path
    });
  });

  process.on("SIGINT", () => {
    listener.close(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    listener.close(() => process.exit(0));
  });
}

function parseOptions(args: string[], env: NodeJS.ProcessEnv): CliOptions {
  const defaults: CliOptions = {
    transport: parseTransport(env.FRAUDGUARD_MCP_TRANSPORT ?? "stdio"),
    host: env.FRAUDGUARD_MCP_HOST ?? "127.0.0.1",
    port: parsePort(env.FRAUDGUARD_MCP_PORT ?? env.PORT ?? "3000"),
    path: env.FRAUDGUARD_MCP_PATH ?? "/mcp"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    }

    if (arg === "--transport") {
      defaults.transport = parseTransport(readNextArg(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--host") {
      defaults.host = readNextArg(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--port") {
      defaults.port = parsePort(readNextArg(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--path") {
      defaults.path = normalizePath(readNextArg(args, index, arg));
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  defaults.path = normalizePath(defaults.path);

  return defaults;
}

function parseTransport(value: string): TransportMode {
  if (value === "stdio" || value === "http") {
    return value;
  }

  throw new Error("Transport must be either 'stdio' or 'http'.");
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Port must be an integer between 1 and 65535.");
  }

  return port;
}

function normalizePath(value: string): string {
  if (!value.startsWith("/")) {
    return `/${value}`;
  }

  return value;
}

function readNextArg(args: string[], index: number, flag: string): string {
  const value = args[index + 1];

  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function printHelpAndExit(): never {
  process.stdout.write(`FraudGuard MCP Server

Usage:
  fraudguard-mcp [--transport stdio|http] [--host 127.0.0.1] [--port 3000] [--path /mcp]

Environment:
  FRAUDGUARD_API_USERNAME   Required FraudGuard API username
  FRAUDGUARD_API_PASSWORD   Required FraudGuard API password
  FRAUDGUARD_API_BASE_URL   Optional FraudGuard API base URL, default https://api.fraudguard.io
  FRAUDGUARD_MCP_TRANSPORT  Optional transport, default stdio
  FRAUDGUARD_MCP_HOST       Optional HTTP host, default 127.0.0.1
  FRAUDGUARD_MCP_PORT       Optional HTTP port, default 3000
  FRAUDGUARD_MCP_PATH       Optional HTTP path, default /mcp
`);
  process.exit(0);
}

main().catch((error) => {
  logger.error("mcp_server_failed", {
    error: error instanceof Error ? error.message : "Unknown error"
  });
  process.exit(1);
});

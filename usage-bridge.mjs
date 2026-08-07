import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.USAGE_METER_PORT ?? "4317", 10);
const PROJECT_DIR = fileURLToPath(new URL(".", import.meta.url));
const REQUEST_TIMEOUT_MS = 10_000;
const RESET_CREDIT_EXPIRATIONS_FILE = join(PROJECT_DIR, "reset-credit-expirations.json");
const BUNDLED_CODEX_COMMAND = "/Applications/ChatGPT.app/Contents/Resources/codex";
const CODEX_COMMAND = process.env.USAGE_METER_CODEX_COMMAND
  ?? (existsSync(BUNDLED_CODEX_COMMAND) ? BUNDLED_CODEX_COMMAND : "codex");
const STATIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
  ["/E_can.png", "E_can.png"],
  ["/reset_credit_icon.png", "reset_credit_icon.png"],
  ["/meter_frame.png", "meter_frame.png"],
  ["/meter_cell.png", "meter_cell.png"],
  ["/frame_block.png", "frame_block.png"],
  ["/widget_frame.png", "widget_frame.png"],
  ["/usage_meter_design.png", "usage_meter_design.png"],
]);
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};

let codexProcess = null;
let initialized = null;
let nextRequestId = 1;
const pendingRequests = new Map();

function rejectPending(error) {
  for (const { reject, timer } of pendingRequests.values()) {
    clearTimeout(timer);
    reject(error);
  }
  pendingRequests.clear();
}

function handleCodexMessage(line) {
  let message;

  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (message.id === undefined || !pendingRequests.has(message.id)) {
    return;
  }

  const pending = pendingRequests.get(message.id);
  pendingRequests.delete(message.id);
  clearTimeout(pending.timer);

  if (message.error) {
    pending.reject(new Error(message.error.message ?? "Codex app-server request failed."));
    return;
  }

  pending.resolve(message.result);
}

function sendCodexRequest(method, params) {
  return new Promise((resolve, reject) => {
    if (!codexProcess?.stdin.writable) {
      reject(new Error("Codex app-server is not running."));
      return;
    }

    const id = nextRequestId;
    nextRequestId += 1;
    const request = { id, method };
    if (params !== undefined) {
      request.params = params;
    }

    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`${method} timed out.`));
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(id, { resolve, reject, timer });
    codexProcess.stdin.write(`${JSON.stringify(request)}\n`);
  });
}

function ensureCodexConnection() {
  if (initialized) {
    return initialized;
  }

  initialized = new Promise((resolve, reject) => {
    codexProcess = spawn(CODEX_COMMAND, ["app-server", "--stdio"], {
      cwd: PROJECT_DIR,
      stdio: ["pipe", "pipe", "pipe"],
    });
    codexProcess.stderr.resume();

    const output = createInterface({ input: codexProcess.stdout });
    output.on("line", handleCodexMessage);

    codexProcess.once("error", (error) => {
      initialized = null;
      rejectPending(error);
      reject(error);
    });

    codexProcess.once("exit", (code) => {
      const error = new Error(`Codex app-server stopped (exit ${code ?? "unknown"}).`);
      codexProcess = null;
      initialized = null;
      rejectPending(error);
    });

    sendCodexRequest("initialize", {
      clientInfo: { name: "usage-meter", version: "1.0.0" },
      capabilities: { experimentalApi: true },
    }).then(resolve, reject);
  });

  return initialized;
}

function toRemainingPercent(window) {
  if (!window || !Number.isFinite(window.usedPercent)) {
    return null;
  }

  return Math.min(100, Math.max(0, 100 - window.usedPercent));
}

function selectWeeklyWindow(limits) {
  const windows = [limits?.secondary, limits?.primary].filter(
    (window) => window && Number.isFinite(window.usedPercent),
  );

  return windows.reduce((longest, window) => {
    if (!longest) {
      return window;
    }
    return (window.windowDurationMins ?? 0) > (longest.windowDurationMins ?? 0)
      ? window
      : longest;
  }, null);
}

function toExpirationIso(value) {
  const candidate = value && typeof value === "object"
    ? value.expiresAt
      ?? value.expires_at
      ?? value.expiration
      ?? value.expiresOn
      ?? value.expires_on
    : value;
  // App Server uses Unix seconds, while JavaScript Date expects milliseconds.
  const timestamp = typeof candidate === "number"
    ? (candidate < 100_000_000_000 ? candidate * 1_000 : candidate)
    : Date.parse(candidate);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp).toISOString();
}

function normalizeExpirationList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map(toExpirationIso).filter(Boolean))]
    .filter((expiration) => Date.parse(expiration) > Date.now())
    .sort((left, right) => Date.parse(left) - Date.parse(right));
}

function extractApiResetCreditExpirations(summary) {
  const candidates = [
    summary?.expirations,
    summary?.credits,
    summary?.items,
    summary?.resetCredits,
  ];
  return candidates.map(normalizeExpirationList).find((values) => values.length > 0) ?? [];
}

async function readConfiguredResetCreditExpirations() {
  try {
    const payload = JSON.parse(await readFile(RESET_CREDIT_EXPIRATIONS_FILE, "utf8"));
    return normalizeExpirationList(Array.isArray(payload) ? payload : payload.expirations);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`期限設定を読み込めませんでした: ${error.message}`);
    }
    return [];
  }
}

async function resolveResetCreditExpirations(summary, availableCount) {
  if (availableCount === 0) {
    return { expirations: [], source: "unavailable" };
  }

  const apiExpirations = extractApiResetCreditExpirations(summary);
  if (apiExpirations.length > 0) {
    return {
      expirations: apiExpirations.slice(0, availableCount),
      source: "api",
    };
  }

  const configuredExpirations = await readConfiguredResetCreditExpirations();
  if (configuredExpirations.length > 0) {
    return {
      expirations: configuredExpirations.slice(-availableCount),
      source: "config",
    };
  }

  return { expirations: [], source: "unavailable" };
}

async function readCurrentUsage() {
  await ensureCodexConnection();
  const result = await sendCodexRequest("account/rateLimits/read");
  const limits = result.rateLimitsByLimitId?.codex ?? result.rateLimits;
  const weeklyWindow = selectWeeklyWindow(limits);
  const remaining = toRemainingPercent(weeklyWindow);
  const resetCreditSummary = result.rateLimitResetCredits;
  const resetCredits = Math.max(0, resetCreditSummary?.availableCount ?? 0);
  const resetCreditExpirationData = await resolveResetCreditExpirations(
    resetCreditSummary,
    resetCredits,
  );

  if (remaining === null) {
    throw new Error("Codex did not return a weekly usage window.");
  }

  return {
    total: 100,
    remaining,
    primaryRemaining: toRemainingPercent(limits.primary),
    secondaryRemaining: toRemainingPercent(limits.secondary),
    weeklyWindowMinutes: weeklyWindow.windowDurationMins,
    resetCredits,
    resetCreditExpirations: resetCreditExpirationData.expirations,
    resetCreditExpirationSource: resetCreditExpirationData.source,
    updatedAt: new Date().toISOString(),
  };
}

async function consumeRateLimitResetCredit(idempotencyKey) {
  await ensureCodexConnection();
  const result = await sendCodexRequest("account/rateLimitResetCredit/consume", {
    idempotencyKey: idempotencyKey || randomUUID(),
  });

  return {
    outcome: result.outcome,
    usage: await readCurrentUsage(),
  };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 4096) {
        reject(new Error("リクエストが大きすぎます。"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("JSONの形式が不正です。"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function serveStaticFile(response, pathname) {
  const fileName = STATIC_FILES.get(pathname);
  if (!fileName) {
    response.writeHead(404).end();
    return;
  }

  const filePath = join(PROJECT_DIR, fileName);
  response.writeHead(200, {
    "Cache-Control": "no-cache",
    "Content-Type": CONTENT_TYPES[extname(fileName)] ?? "application/octet-stream",
  });
  createReadStream(filePath)
    .on("error", () => response.destroy())
    .pipe(response);
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", `http://${HOST}:${PORT}`).pathname;

  if (pathname === "/api/usage" && request.method === "GET") {
    try {
      sendJson(response, 200, await readCurrentUsage());
    } catch (error) {
      sendJson(response, 503, { error: error.message });
    }
    return;
  }

  if (pathname === "/api/usage/reset" && request.method === "POST") {
    const expectedOrigin = `http://${HOST}:${PORT}`;
    if (request.headers.origin && request.headers.origin !== expectedOrigin) {
      sendJson(response, 403, { error: "別のページからのリセット操作はできません。" });
      return;
    }
    if (request.headers["x-usage-reset-confirm"] !== "consume") {
      sendJson(response, 400, { error: "リセット消費の確認が必要です。" });
      return;
    }

    try {
      const body = await readJsonBody(request);
      if (typeof body.idempotencyKey !== "string" || body.idempotencyKey.length < 16) {
        sendJson(response, 400, { error: "冪等キーが不正です。" });
        return;
      }
      sendJson(response, 200, await consumeRateLimitResetCredit(body.idempotencyKey));
    } catch (error) {
      sendJson(response, 503, { error: error.message });
    }
    return;
  }

  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET, POST" }).end();
    return;
  }

  serveStaticFile(response, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`Codex Usage Meter: http://${HOST}:${PORT}`);
});

function shutdown() {
  server.close();
  codexProcess?.kill();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

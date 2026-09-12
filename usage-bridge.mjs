import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import { extname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.USAGE_METER_PORT ?? "4317", 10);
const PROJECT_DIR = fileURLToPath(new URL(".", import.meta.url));
const REQUEST_TIMEOUT_MS = 10_000;
const RECORDING_TIMEOUT_MS = 120_000;
const RECORDING_RETENTION_MS = 60 * 60 * 1000;
const RESET_CREDIT_EXPIRATIONS_FILE = join(PROJECT_DIR, "reset-credit-expirations.json");
const RECORDING_SCRIPT_CANDIDATES = [
  join(PROJECT_DIR, "social_video", "render_actual_use_video.mjs"),
  join(PROJECT_DIR, "..", "social_video", "render_actual_use_video.mjs"),
];
const RECORDING_SCRIPT = RECORDING_SCRIPT_CANDIDATES.find(existsSync) ?? null;
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
const recordingJobs = new Map();
let activeRecordingId = null;

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

function isExpectedOrigin(request) {
  return !request.headers.origin || request.headers.origin === `http://${HOST}:${PORT}`;
}

function normalizeRecordingRequest(body) {
  const total = Number(body.total);
  const remaining = Number(body.remaining);
  const resetCredits = Number(body.resetCredits);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(remaining)) {
    throw new TypeError("録画する使用量データが不正です。");
  }
  return {
    total: Math.min(Math.max(total, 1), 10_000),
    remaining: Math.min(Math.max(remaining, 0), total),
    resetCredits: Number.isFinite(resetCredits)
      ? Math.min(Math.max(Math.trunc(resetCredits), 0), 100)
      : 0,
    resetCreditExpirations: Array.isArray(body.resetCreditExpirations)
      ? body.resetCreditExpirations
        .slice(0, 100)
        .map((value) => value === null || typeof value === "string" ? value : null)
      : [],
    resetCreditDisplayLabels: Array.isArray(body.resetCreditDisplayLabels)
      ? body.resetCreditDisplayLabels
        .filter((value) => typeof value === "string")
        .slice(0, 100)
        .map((value) => value.slice(0, 24))
      : [],
    showStockPanel: body.showStockPanel === true,
    design: ["classic", "blue", "red", "green", "purple"].includes(body.design)
      ? body.design
      : "classic",
    bgmEnabled: body.bgmEnabled === true,
    settings: body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
      ? body.settings
      : {},
  };
}

function recordingPublicState(job) {
  return {
    id: job.id,
    status: job.status,
    fileName: job.fileName,
    error: job.error,
    downloadUrl: job.status === "complete" ? `/api/recordings/${job.id}/file` : null,
  };
}

async function validateRecordingFile(filePath) {
  const info = await stat(filePath);
  if (!info.isFile() || info.size < 10_000) {
    throw new Error("生成された録画ファイルが不完全です。");
  }
  const handle = await open(filePath, "r");
  try {
    const signature = Buffer.alloc(12);
    await handle.read(signature, 0, signature.length, 0);
    if (signature.toString("ascii", 4, 8) !== "ftyp") {
      throw new Error("生成された録画ファイルはMP4形式ではありません。");
    }
  } finally {
    await handle.close();
  }
}

async function removeRecordingJob(id) {
  const job = recordingJobs.get(id);
  if (!job) return;
  recordingJobs.delete(id);
  if (activeRecordingId === id) activeRecordingId = null;
  await rm(job.tempRoot, { recursive: true, force: true }).catch(() => {});
}

async function createRecordingJob(options) {
  if (!RECORDING_SCRIPT) throw new Error("録画用レンダラーが見つかりません。");
  if (activeRecordingId) {
    const active = recordingJobs.get(activeRecordingId);
    if (active?.status === "recording") {
      const error = new Error("別の録画を処理中です。");
      error.code = "RECORDING_BUSY";
      throw error;
    }
    activeRecordingId = null;
  }

  const id = randomUUID();
  const tempRoot = await mkdtemp(join(os.tmpdir(), "usage-meter-recording-"));
  const outputPath = join(tempRoot, "recording.mp4");
  const timestamp = new Date().toLocaleString("sv-SE").replace(/\D/g, "").slice(0, 14);
  const job = {
    id,
    status: "recording",
    fileName: `usage-meter-${timestamp}.mp4`,
    outputPath,
    tempRoot,
    error: null,
    child: null,
    timeout: null,
  };
  recordingJobs.set(id, job);
  activeRecordingId = id;

  const child = spawn(process.execPath, [RECORDING_SCRIPT], {
    cwd: PROJECT_DIR,
    env: {
      ...process.env,
      USAGE_METER_SAFE_RECORDING: "1",
      USAGE_METER_CONSUME_CREDIT: "0",
      USAGE_METER_REPLAY: "1",
      USAGE_METER_INCLUDE_BGM: options.bgmEnabled ? "1" : "0",
      USAGE_METER_OUTPUT_VIDEO: outputPath,
      USAGE_METER_OUTPUT_PREVIEW: "",
      USAGE_METER_SOURCE_URL: `http://${HOST}:${PORT}/?demo=1&recording=1`,
      USAGE_METER_RECORDING_STATE: JSON.stringify(options),
      USAGE_METER_RECORDING_SETTINGS: JSON.stringify(options.settings),
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  job.child = child;
  let errorOutput = "";
  child.stderr.on("data", (chunk) => {
    errorOutput = `${errorOutput}${chunk}`.slice(-8_000);
  });
  job.timeout = setTimeout(() => {
    job.error = "録画処理がタイムアウトしました。";
    child.kill("SIGTERM");
  }, RECORDING_TIMEOUT_MS);
  child.once("error", (error) => { job.error = error.message; });
  child.once("exit", async (code) => {
    clearTimeout(job.timeout);
    job.timeout = null;
    job.child = null;
    try {
      if (code !== 0) {
        throw new Error(job.error || errorOutput.trim() || `録画処理が終了しました（${code}）。`);
      }
      await validateRecordingFile(outputPath);
      job.status = "complete";
    } catch (error) {
      job.status = "failed";
      job.error = error.message;
    } finally {
      if (activeRecordingId === id) activeRecordingId = null;
      const cleanupTimer = setTimeout(() => removeRecordingJob(id), RECORDING_RETENTION_MS);
      cleanupTimer.unref();
    }
  });
  return job;
}

function sendRecordingFile(response, job) {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${job.fileName}"`,
    "Content-Type": "video/mp4",
  });
  createReadStream(job.outputPath).on("error", () => response.destroy()).pipe(response);
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
    if (!isExpectedOrigin(request)) {
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

  if (pathname === "/api/recordings" && request.method === "POST") {
    if (!isExpectedOrigin(request)) {
      sendJson(response, 403, { error: "別のページから録画を開始できません。" });
      return;
    }
    try {
      const job = await createRecordingJob(normalizeRecordingRequest(await readJsonBody(request)));
      sendJson(response, 202, recordingPublicState(job));
    } catch (error) {
      sendJson(response, error.code === "RECORDING_BUSY" ? 409 : 503, { error: error.message });
    }
    return;
  }

  const recordingMatch = pathname.match(/^\/api\/recordings\/([0-9a-f-]+)(?:\/(file))?$/);
  if (recordingMatch && request.method === "GET") {
    const job = recordingJobs.get(recordingMatch[1]);
    if (!job) {
      sendJson(response, 404, { error: "録画データが見つかりません。" });
      return;
    }
    if (recordingMatch[2] === "file") {
      if (job.status !== "complete") {
        sendJson(response, 409, { error: "録画ファイルはまだ完成していません。" });
        return;
      }
      sendRecordingFile(response, job);
      return;
    }
    sendJson(response, 200, recordingPublicState(job));
    return;
  }

  if (recordingMatch && request.method === "DELETE") {
    if (!isExpectedOrigin(request)) {
      sendJson(response, 403, { error: "別のページから録画を停止できません。" });
      return;
    }
    const job = recordingJobs.get(recordingMatch[1]);
    if (!job) {
      sendJson(response, 404, { error: "録画データが見つかりません。" });
      return;
    }
    job.child?.kill("SIGTERM");
    job.status = "cancelled";
    job.error = "録画を停止しました。";
    await removeRecordingJob(job.id);
    sendJson(response, 200, { id: job.id, status: "cancelled" });
    return;
  }

  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET, POST, DELETE" }).end();
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
  for (const job of recordingJobs.values()) {
    job.child?.kill("SIGTERM");
    clearTimeout(job.timeout);
    rm(job.tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

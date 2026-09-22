import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Readable, Writable } from "node:stream";
import { after, mock, test } from "node:test";

// Hermetic request tests: no sockets, account files, Codex, browser or ffmpeg.
const authority = "127.0.0.1:49171";
const origin = `http://${authority}`;
const id = "00000000-0000-4000-8000-000000000001";
const effects = [];
let handler;
let failUsage = false;
const oldPort = process.env.USAGE_METER_PORT;
process.env.USAGE_METER_PORT = "49171";
const signalListeners = new Map(["SIGINT", "SIGTERM"].map((s) => [s, process.listeners(s)]));

mock.module("node:http", { namedExports: {
  createServer(callback) {
    handler = callback;
    return { listen() {}, close() {} };
  },
} });
mock.module("node:crypto", { namedExports: { randomUUID: () => id } });
mock.module("node:fs", { namedExports: {
  existsSync: (path) => path.endsWith("render_actual_use_video.mjs"),
  createReadStream(path) {
    effects.push("read-stream");
    return Readable.from([path.endsWith(".mp4") ? Buffer.from("synthetic-mp4") : "synthetic-page"]);
  },
} });
mock.module("node:fs/promises", { namedExports: {
  mkdtemp: async () => { effects.push("mkdir"); return "/synthetic/recording"; },
  rm: async () => { effects.push("remove"); },
  stat: async () => ({ isFile: () => true, size: 20000 }),
  open: async () => ({
    read: async (buffer) => { buffer.write("ftyp", 4, "ascii"); },
    close: async () => {},
  }),
  readFile: async () => { throw new Error("Private configuration must not be read in this test"); },
} });
mock.module("node:child_process", { namedExports: {
  spawn(command, args) {
    effects.push(args[0] === "app-server" ? "spawn-codex" : "spawn-recorder");
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => { effects.push("kill"); child.stdout.end(); child.stderr.end(); };
    child.stdin = new Writable({ write(chunk, encoding, done) {
      const request = JSON.parse(chunk.toString());
      effects.push(request.method);
      const result = request.method === "account/rateLimits/read"
        ? { rateLimits: { primary: { usedPercent: 50, windowDurationMins: 300 },
            secondary: { usedPercent: 75, windowDurationMins: 10080 } },
            rateLimitResetCredits: { availableCount: 0 } }
        : request.method.endsWith("/consume") ? { outcome: "reset" } : {};
      queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: request.id,
        ...(failUsage && request.method === "account/rateLimits/read"
          ? { error: { message: "Synthetic service unavailable" } } : { result }) })}\n`));
      done();
    } });
    if (args[0] !== "app-server") setImmediate(() => child.emit("exit", 0));
    return child;
  },
} });

await import("../usage-bridge.mjs");

after(() => {
  for (const [signal, previous] of signalListeners) {
    for (const listener of process.listeners(signal)) {
      if (!previous.includes(listener)) {
        listener();
        process.removeListener(signal, listener);
      }
    }
  }
  if (oldPort === undefined) delete process.env.USAGE_METER_PORT;
  else process.env.USAGE_METER_PORT = oldPort;
  mock.restoreAll();
});

async function request(method, url, headers = {}, body) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, headers: { host: authority, ...headers } });
  const chunks = [];
  const res = new Writable({ write(chunk, encoding, done) { chunks.push(chunk); done(); } });
  res.headers = {};
  res.setHeader = (key, value) => { res.headers[key.toLowerCase()] = value; };
  res.writeHead = (status, fields = {}) => {
    res.statusCode = status;
    for (const [key, value] of Object.entries(fields)) res.setHeader(key, value);
    return res;
  };
  const finished = new Promise((resolve, reject) => { res.on("finish", resolve); res.on("error", reject); });
  await handler(req, res);
  await finished;
  return { status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() };
}

test("untrusted callers cannot reach any API or trigger side effects", async () => {
  const callers = [
    {},
    { origin: "https://untrusted.example" },
    { origin: "null" },
    { origin: "http://127.0.0.1:49172" },
    { origin: "http://localhost:49171" },
    { origin: "https://127.0.0.1:49171" },
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
    { "sec-fetch-site": "none" },
    { referer: "https://untrusted.example/" },
    { referer: "not a URL" },
    { origin, "sec-fetch-site": "cross-site" },
    { origin: "null", "sec-fetch-site": "same-origin" },
    { origin, referer: "http://127.0.0.1:49172/" },
    { "sec-fetch-site": "same-origin", host: "rebind.example:49171" },
    { "sec-fetch-site": "same-origin", host: "127.0.0.1:49172" },
    { "sec-fetch-site": "same-origin", host: undefined },
  ];
  for (const headers of callers) {
    for (const [method, url] of [
      ["GET", "/api/usage"], ["POST", "/api/usage/reset"],
      ["POST", "/api/recordings"], ["GET", `/api/recordings/${id}`],
      ["GET", `/api/recordings/${id}/file`], ["DELETE", `/api/recordings/${id}`],
      ["OPTIONS", "/api/usage/reset"],
    ]) {
      const before = effects.length;
      const response = await request(method, url, headers);
      assert.equal(response.status, 403, `${method} ${url}: ${JSON.stringify(headers)}`);
      assert.equal(response.headers["access-control-allow-origin"], undefined);
      assert.equal(effects.length, before, "rejection must precede account/file/process access");
    }
  }
});

test("same-origin usage fetches work with modern and legacy browser headers", async () => {
  for (const headers of [
    { "sec-fetch-site": "same-origin" },
    { origin },
    { referer: `${origin}/?demo=0` },
    { origin, referer: `${origin}/`, "sec-fetch-site": "same-origin" },
  ]) {
    const response = await request("GET", "/api/usage", headers);
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).remaining, 25);
    assert.equal(response.headers["access-control-allow-origin"], undefined);
    assert.equal(response.headers["cache-control"], "no-store");
  }
});

test("reset keeps its explicit consume header and idempotency-key checks", async () => {
  const resetCalls = () => effects.filter((e) => e.endsWith("/consume")).length;
  const before = resetCalls();
  assert.equal((await request("POST", "/api/usage/reset", { origin }, { idempotencyKey: id })).status, 400);
  const headers = { origin, "x-usage-reset-confirm": "consume" };
  assert.equal((await request("POST", "/api/usage/reset", headers, { idempotencyKey: "short" })).status, 400);
  assert.equal(resetCalls(), before);
  assert.equal((await request("POST", "/api/usage/reset", headers, { idempotencyKey: id })).status, 200);
  assert.equal(resetCalls(), before + 1);
});

test("recording start, status, download and cancellation remain usable", async () => {
  const headers = { origin, "sec-fetch-site": "same-origin" };
  assert.equal((await request("POST", "/api/recordings", headers, { total: 100, remaining: 0 })).status, 202);
  await new Promise(setImmediate);
  const status = await request("GET", `/api/recordings/${id}`, headers);
  assert.equal(JSON.parse(status.body).status, "complete");
  const file = await request("GET", `/api/recordings/${id}/file`, { "sec-fetch-site": "same-origin" });
  assert.equal(file.status, 200);
  assert.equal(file.body, "synthetic-mp4");
  assert.equal((await request("DELETE", `/api/recordings/${id}`, headers)).status, 200);
  assert.equal((await request("GET", `/api/recordings/${id}`, headers)).status, 404);
});

test("static page works for launcher; rebinding and embedding are blocked", async () => {
  const page = await request("GET", "/");
  assert.equal(page.status, 200);
  assert.equal(page.headers["x-frame-options"], "DENY");
  assert.equal(page.headers["content-security-policy"], "frame-ancestors 'none'");
  const before = effects.length;
  assert.equal((await request("GET", "/", { host: "rebind.example:49171" })).status, 403);
  assert.equal(effects.length, before);
});

test("usage errors do not restore permissive CORS", async () => {
  failUsage = true;
  const response = await request("GET", "/api/usage", { origin });
  failUsage = false;
  assert.equal(response.status, 503);
  assert.equal(response.headers["access-control-allow-origin"], undefined);
});

test("invalid and foreign absolute request targets fail before side effects", async () => {
  const before = effects.length;
  for (const url of ["http://untrusted.example/api/usage", "//untrusted.example/api/usage"]) {
    assert.equal((await request("GET", url, { origin })).status, 403);
  }
  assert.equal((await request("GET", "http://[invalid", { origin })).status, 400);
  assert.equal(effects.length, before);
});

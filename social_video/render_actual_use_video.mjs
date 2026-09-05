#!/usr/bin/env node

/**
 * 実際のindex.htmlをHeadless Chromeで描画・操作し、縦型デモ動画を生成する。
 *
 * ローカル連携サーバーから実アカウントの使用率を表示し、動画内で
 * Shift+クリックによる週枠リセットクレジットを1回だけ実際に消費する。
 * 実消費はUSAGE_METER_CONSUME_CREDIT=1を明示した場合だけ有効になる。
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SAFE_RECORDING = process.env.USAGE_METER_SAFE_RECORDING === "1";
const OUTPUT_VIDEO = process.env.USAGE_METER_OUTPUT_VIDEO
  ? path.resolve(process.env.USAGE_METER_OUTPUT_VIDEO)
  : path.join(SCRIPT_DIR, "actual_use_demo_youtube_short.mp4");
const OUTPUT_PREVIEW = process.env.USAGE_METER_OUTPUT_PREVIEW === ""
  ? null
  : process.env.USAGE_METER_OUTPUT_PREVIEW
    ? path.resolve(process.env.USAGE_METER_OUTPUT_PREVIEW)
    : path.join(SCRIPT_DIR, "actual_use_demo_youtube_short_preview.png");
function findExecutable(candidates, probeArgs = ["--version"]) {
  return candidates.filter(Boolean).find((candidate) => (
    candidate.includes(path.sep)
      ? existsSync(candidate)
      : spawnSync(candidate, probeArgs, { stdio: "ignore" }).status === 0
  )) ?? null;
}

const CHROME = process.env.USAGE_METER_CHROME_COMMAND ?? findExecutable([
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  process.env.ProgramFiles && `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env["ProgramFiles(x86)"] && `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
  "google-chrome",
  "microsoft-edge",
  "chromium",
]);
const FFMPEG = process.env.USAGE_METER_FFMPEG_COMMAND ?? findExecutable([
  "/opt/homebrew/bin/ffmpeg",
  "/usr/local/bin/ffmpeg",
  "ffmpeg",
], ["-version"]);
const WIDTH = 540;
const HEIGHT = 960;
const FPS = 15;
const INCLUDE_BGM = process.env.USAGE_METER_INCLUDE_BGM !== "0";
const RECOVERY_START = INCLUDE_BGM ? 1.05 : 0.85;
const MEMORY_COUNT = 28;
// 019f2628-8660-7670-b3ca-70a1f551bb4cで確定した原音合わせ値。
const DEFAULT_SOUND_SETTINGS = Object.freeze({
  noteDurationMs: 50,
  recoveryIntervalMs: 66.5,
  soundIntervalMs: 66.5,
  attackMs: 0,
  decayMs: 0,
  sustainLevel: 1,
  releaseMs: 1,
  disconnectDelayMs: 5,
  frequency1: 1025.3,
  frequencyStep1: 20.6,
  volume1: 0.2,
  frequency2: 1286.7,
  frequencyStep2: 30.6,
  volume2: 0.195,
  pitchStepIntervalMs: 16.5,
  waveform: "pulse",
  pulseDutyCycle: 0.25,
  highpassEnabled: true,
  highpassFrequency: 200,
  highpassQ: 4.2,
  lowpassEnabled: false,
  lowpassFrequency: 12000,
  lowpassQ: 0.7,
  eqLowType: "lowshelf",
  eqLowFrequency: 1000,
  eqLowGain: 0,
  eqLowQ: 0.7,
  eqMidType: "peaking",
  eqMidFrequency: 3000,
  eqMidGain: 0,
  eqMidQ: 1,
  eqHighType: "highshelf",
  eqHighFrequency: 6300,
  eqHighGain: -2,
  eqHighQ: 0.7,
});
const SOUND_SETTING_LIMITS = Object.freeze({
  noteDurationMs: [30, 800],
  recoveryIntervalMs: [40, 1000],
  soundIntervalMs: [40, 1000],
  attackMs: [0, 300],
  decayMs: [0, 500],
  sustainLevel: [0, 1],
  releaseMs: [0, 800],
  disconnectDelayMs: [0, 200],
  frequency1: [50, 4000],
  frequencyStep1: [-500, 500],
  volume1: [0, 0.2],
  frequency2: [50, 4000],
  frequencyStep2: [-500, 500],
  volume2: [0, 0.2],
  pitchStepIntervalMs: [0, 100],
  pulseDutyCycle: [0.05, 0.5],
  highpassFrequency: [20, 5000],
  highpassQ: [0.2, 8],
  lowpassFrequency: [1000, 20000],
  lowpassQ: [0.2, 8],
  eqLowFrequency: [400, 2000],
  eqLowGain: [-36, 36],
  eqLowQ: [0.2, 8],
  eqMidFrequency: [500, 8000],
  eqMidGain: [-36, 36],
  eqMidQ: [0.2, 8],
  eqHighFrequency: [2000, 16000],
  eqHighGain: [-36, 36],
  eqHighQ: [0.2, 8],
});
const DEFAULT_RECORDING_STATE = Object.freeze({
  total: 100,
  remaining: 0,
  design: "classic",
  resetCredits: 0,
  resetCreditExpirations: [],
  visualCreditUse: false,
  showStockPanel: false,
});

function readRecordingState() {
  try {
    const parsed = JSON.parse(process.env.USAGE_METER_RECORDING_STATE ?? "{}");
    const total = Number.isFinite(parsed.total) && parsed.total > 0 ? parsed.total : 100;
    const remaining = Number.isFinite(parsed.remaining)
      ? Math.min(Math.max(parsed.remaining, 0), total)
      : 0;
    return {
      total,
      remaining,
      design: ["classic", "blue", "red", "green", "purple"].includes(parsed.design)
        ? parsed.design
        : "classic",
      resetCredits: Number.isFinite(parsed.resetCredits)
        ? Math.max(0, Math.trunc(parsed.resetCredits))
        : 0,
      resetCreditExpirations: Array.isArray(parsed.resetCreditExpirations)
        ? parsed.resetCreditExpirations
          .map((value) => {
            if (value === null) return null;
            const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
            return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
          })
        : [],
      visualCreditUse: parsed.visualCreditUse === true,
      showStockPanel: parsed.showStockPanel === true,
    };
  } catch {
    return { ...DEFAULT_RECORDING_STATE };
  }
}

const RECORDING_STATE = readRecordingState();
function readSoundSettings() {
  try {
    const parsed = JSON.parse(process.env.USAGE_METER_RECORDING_SETTINGS ?? "{}");
    return Object.fromEntries(Object.entries(DEFAULT_SOUND_SETTINGS).map(([name, fallback]) => {
      if (typeof fallback === "boolean") {
        return [name, typeof parsed[name] === "boolean" ? parsed[name] : fallback];
      }
      if (typeof fallback === "string") {
        const allowed = name === "waveform"
          ? ["pulse", "sawtooth"]
          : ["peaking", "lowshelf", "highshelf"];
        return [name, allowed.includes(parsed[name]) ? parsed[name] : fallback];
      }
      const value = Number(parsed[name]);
      const [minimum, maximum] = SOUND_SETTING_LIMITS[name];
      return [name, Number.isFinite(value)
        ? Math.min(Math.max(value, minimum), maximum)
        : fallback];
    }));
  } catch {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
}
const SOUND_SETTINGS = readSoundSettings();
const RECOVERY_INTERVAL_SECONDS = SOUND_SETTINGS.recoveryIntervalMs / 1000;
const SOUND_INTERVAL_SECONDS = SOUND_SETTINGS.soundIntervalMs / 1000;
const START_MEMORY_COUNT = Math.round(
  (RECORDING_STATE.remaining / RECORDING_STATE.total) * MEMORY_COUNT,
);
const RECOVERY_NOTE_COUNT = Math.max(0, MEMORY_COUNT - START_MEMORY_COUNT);
const RECOVERY_DURATION_SECONDS = Math.max(
  0,
  (RECOVERY_NOTE_COUNT - 1) * RECOVERY_INTERVAL_SECONDS,
);
const REQUESTED_END_SECONDS = RECOVERY_START + RECOVERY_DURATION_SECONDS + 0.5;
const FRAME_COUNT = Math.max(1, Math.ceil(FPS * REQUESTED_END_SECONDS));
const DURATION_SECONDS = FRAME_COUNT / FPS;
const SOURCE_URL = process.env.USAGE_METER_SOURCE_URL ?? "http://127.0.0.1:4317/";
// app.jsのE缶ラベルは「E缶 N個。押すと…」形式。残数はここから読み取る。
const CREDIT_LABEL_PATTERN = /E缶\s*([0-9]+)個/;
const CREDIT_LABEL_PATTERN_SOURCE = "/E缶\\s*([0-9]+)個/";
const REPLAY = SAFE_RECORDING || process.env.USAGE_METER_REPLAY === "1";
// 録画APIから起動された場合は、親プロセスに実消費指定が残っていても無効化する。
const CONSUME_CREDIT = !SAFE_RECORDING
  && process.env.USAGE_METER_CONSUME_CREDIT === "1";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForJson(url, attempts = 80) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Chrome DevToolsへ接続できませんでした: ${lastError?.message ?? "unknown"}`);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !this.pending.has(message.id)) {
        return;
      }
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    });

    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket?.close();
  }
}

function setupVideoScreen(recoveryStart, recoveryEnd, animationEnd, showStockPanel) {
  document.title = "Codex Usage Meter - Actual Use Demo";

  const style = document.createElement("style");
  style.textContent = `
    html, body {
      width: 540px !important;
      height: 960px !important;
      min-height: 960px !important;
      overflow: hidden !important;
      background: #030817 !important;
    }

    .usage-widget {
      position: fixed !important;
      top: 255px !important;
      left: 153px !important;
      width: 234px !important;
      height: 450px !important;
      min-height: 450px !important;
    }

    #videoCursor {
      position: fixed;
      z-index: 30;
      width: 25px;
      height: 32px;
      opacity: 0;
      filter: drop-shadow(2px 3px 0 rgba(0, 0, 0, 0.75));
      pointer-events: none;
    }
  `;
  document.head.append(style);

  document.body.insertAdjacentHTML("beforeend", `
    <svg id="videoCursor" viewBox="0 0 26 34" aria-hidden="true">
      <path d="M2 2v25l6-6 5 11 5-3-5-10h9z" fill="#fff" stroke="#07101d" stroke-width="2" stroke-linejoin="round"/>
    </svg>
  `);

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const smooth = (value) => {
    const x = clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
  };
  const lerp = (start, end, progress) => start + (end - start) * progress;

  const cursor = document.querySelector("#videoCursor");
  const energyCanButton = document.querySelector(".energy-can-button");
  const energyMeter = document.querySelector(".energy-meter");
  const energyCanArea = document.querySelector(".energy-can-area");
  const resetCounter = document.querySelector("#resetCounter");
  const stockPanel = document.querySelector("#resetExpiryTooltip");
  window.__videoUpdate = (time) => {
    const stockPanelOpen = showStockPanel && time >= 0.14 && time < 0.68;
    let cursorX;
    let cursorY;
    let cursorOpacity;
    if (showStockPanel) {
      const moveToStock = smooth((time - 0.04) / 0.18);
      const moveToCan = smooth((time - 0.68) / 0.30);
      cursorX = time < 0.68
        ? lerp(470, 327, moveToStock)
        : lerp(327, 268, moveToCan);
      cursorY = time < 0.68
        ? lerp(160, 657, moveToStock)
        : lerp(657, 657, moveToCan);
      cursorOpacity = time >= 0.04 && time < 1.42 ? 1 : 0;
    } else {
      const cursorProgress = smooth((time - 0.12) / 0.70);
      cursorX = lerp(470, 268, cursorProgress);
      cursorY = lerp(160, 657, cursorProgress);
      cursorOpacity = time >= 0.12 && time < 1.48 ? 1 : 0;
    }
    cursor.style.left = `${cursorX}px`;
    cursor.style.top = `${cursorY}px`;
    cursor.style.opacity = String(cursorOpacity);

    stockPanel.hidden = !stockPanelOpen;
    energyCanArea.classList.toggle("is-expanded", stockPanelOpen);
    resetCounter.setAttribute("aria-expanded", String(stockPanelOpen));

    // app.jsの回復中クラスをそのまま使い、標準の点滅・上下移動を再現する。
    const isCharging = time >= recoveryStart && time < animationEnd;
    energyCanButton.classList.toggle("is-charging", isCharging);
    energyMeter.classList.toggle("is-charging", isCharging);

    document.querySelector("#demoLabel").hidden = true;
  };

  window.__videoUpdate(0);
}

// 実消費の往復待ちを収録前に済ませ、画面反映だけをRECOVERY_STARTへ合わせる。
const RESET_GATE_SCRIPT = `(() => {
  window.confirm = () => true;
  window.alert = (message) => { window.__videoAlert = String(message); };
  window.__videoResetFetchDone = false;
  window.__videoResetGateRelease = null;
  const gate = new Promise((resolve) => { window.__videoResetGateRelease = resolve; });
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");
    const response = await originalFetch(input, init);
    if (url.includes("/api/usage/reset")) {
      window.__videoResetFetchDone = true;
      await gate;
    }
    return response;
  };
  return true;
})()`;

const RESET_CLICK_SCRIPT = `(() => {
  const button = document.querySelector(".energy-can-button");
  if (!button) {
    throw new Error("E缶ボタンが見つかりません。");
  }
  button.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
  return true;
})()`;

async function startActualReset(client) {
  const gate = await client.send("Runtime.evaluate", {
    expression: RESET_GATE_SCRIPT,
    returnByValue: true,
  });
  if (gate.exceptionDetails) {
    throw new Error(`実消費の待機処理を準備できませんでした: ${gate.exceptionDetails.text}`);
  }

  const click = await client.send("Runtime.evaluate", {
    expression: RESET_CLICK_SCRIPT,
    returnByValue: true,
  });
  if (click.exceptionDetails) {
    throw new Error(`実クレジットの操作を開始できませんでした: ${click.exceptionDetails.text}`);
  }

  // 週枠リセットAPIの往復が終わるまで待ってから収録を始める。
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const done = await client.send("Runtime.evaluate", {
      expression: "window.__videoResetFetchDone === true",
      returnByValue: true,
    });
    if (done.result?.value === true) {
      return;
    }
    await delay(100);
  }
  throw new Error("週枠リセットAPIの応答を確認できませんでした。");
}

async function captureFrames(client, framesDir) {
  const startedAt = Date.now();
  let resetReleased = false;

  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const time = index / FPS;
    const waitMilliseconds = startedAt + Math.round(time * 1000) - Date.now();
    if (waitMilliseconds > 0) {
      await delay(waitMilliseconds);
    }

    if (REPLAY) {
      const elapsedRecoverySeconds = Math.max(0, time - RECOVERY_START);
      const completedSteps = time < RECOVERY_START || RECOVERY_NOTE_COUNT === 0
        ? 0
        : Math.min(
          RECOVERY_NOTE_COUNT,
          Math.floor(elapsedRecoverySeconds / RECOVERY_INTERVAL_SECONDS) + 1,
        );
      const memoryCount = Math.min(MEMORY_COUNT, START_MEMORY_COUNT + completedSteps);
      const visualCreditUsed = RECORDING_STATE.visualCreditUse && time >= RECOVERY_START;
      const replayState = {
        ...RECORDING_STATE,
        remaining: Math.round((memoryCount / MEMORY_COUNT) * RECORDING_STATE.total),
        resetCredits: Math.max(
          0,
          RECORDING_STATE.resetCredits - (visualCreditUsed ? 1 : 0),
        ),
        resetCreditExpirations: visualCreditUsed
          ? RECORDING_STATE.resetCreditExpirations.slice(1)
          : RECORDING_STATE.resetCreditExpirations,
        resetCreditExpirationSource: RECORDING_STATE.resetCreditExpirations.length > 0
          ? "config"
          : "unavailable",
      };
      await client.send("Runtime.evaluate", {
        expression: `window.setUsage(${JSON.stringify(replayState)}); window.__videoUpdate(${time.toFixed(6)})`,
        returnByValue: true,
      });
    } else {
      await client.send("Runtime.evaluate", {
        expression: `window.__videoUpdate(${time.toFixed(6)})`,
        returnByValue: true,
      });
    }

    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: time >= 0.70 && time < RECOVERY_START ? 270 : 30,
      y: time >= 0.70 && time < RECOVERY_START ? 657 : 100,
      button: "none",
      buttons: 0,
    });

    if (CONSUME_CREDIT && !resetReleased && time >= RECOVERY_START) {
      const released = await client.send("Runtime.evaluate", {
        expression: "(() => { window.__videoResetGateRelease?.(); return true; })()",
        returnByValue: true,
      });
      if (released.exceptionDetails) {
        throw new Error(`週枠リセットの画面反映を開始できませんでした: ${released.exceptionDetails.text}`);
      }
      resetReleased = true;
    }

    await client.send("Runtime.evaluate", {
      expression: "new Promise(requestAnimationFrame)",
      awaitPromise: true,
      returnByValue: true,
    });
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const frameName = `frame_${String(index).padStart(4, "0")}.png`;
    await writeFile(path.join(framesDir, frameName), Buffer.from(screenshot.data, "base64"));
    if (index % FPS === 0) {
      process.stdout.write(`\r実画面を収録中: ${Math.round(time)} / ${Math.round(DURATION_SECONDS)} 秒`);
    }
  }
  process.stdout.write("\n");

  const finalState = await client.send("Runtime.evaluate", {
    expression: `(() => ({
      remaining: Number(document.querySelector(".energy-meter").getAttribute("aria-valuenow")),
      total: Number(document.querySelector(".energy-meter").getAttribute("aria-valuemax")),
      creditsLabel: document.querySelector("#resetCounter").getAttribute("aria-label"),
      alertMessage: window.__videoAlert || ""
    }))()`,
    returnByValue: true,
  });
  return finalState.result?.value;
}

function encodeVideo(framesDir, audioPath) {
  const inputs = [
    "-y",
    "-framerate", String(FPS),
    "-i", path.join(framesDir, "frame_%04d.png"),
    "-i", audioPath,
  ];
  const audioMapping = INCLUDE_BGM
    ? (() => {
      const bgmPath = path.join(framesDir, "analyzed_bass_bgm.wav");
      writeAnalyzedBassBgm(bgmPath);
      inputs.push("-i", bgmPath);
      return [
        "-filter_complex",
        "[1:a]volume=0.78[sfx];[2:a]volume=0.55[bgm];[sfx][bgm]amix=inputs=2:duration=first:dropout_transition=0[a]",
        "-map", "[a]",
      ];
    })()
    : ["-filter:a", "volume=0.78", "-map", "1:a:0"];
  const result = spawnSync(FFMPEG, [
    ...inputs,
    "-vf", "scale=1080:1920:flags=neighbor",
    "-map", "0:v:0",
    ...audioMapping,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "17",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    "-shortest",
    OUTPUT_VIDEO,
  ], { encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(`ffmpegでの動画生成に失敗しました。\n${result.stderr}`);
  }
}

function renderStandardRecoveryAudioInPage(
  durationSeconds,
  recoveryStart,
  soundIntervalSeconds,
  recoveryDurationSeconds,
  noteCount,
  soundSettings,
) {
  // app.jsの標準設定を、同じWeb Audioノードでオフラインレンダリングする。
  // Node側でハイパスを近似せず、ブラウザのBiquadFilterとDynamicsCompressorを使う。
  const sampleRate = 48_000;
  const length = Math.ceil(durationSeconds * sampleRate);
  const context = new OfflineAudioContext(1, length, sampleRate);
  const noteDuration = soundSettings.noteDurationMs / 1000;
  const attack = soundSettings.attackMs / 1000;
  const decay = soundSettings.decayMs / 1000;
  const release = soundSettings.releaseMs / 1000;
  const disconnectDelay = soundSettings.disconnectDelayMs / 1000;
  const pitchStepInterval = soundSettings.pitchStepIntervalMs / 1000;
  const pulseDutyCycle = soundSettings.pulseDutyCycle;
  const pulseHarmonicCount = 128;
  const pulseReal = new Float32Array(pulseHarmonicCount + 1);
  const pulseImaginary = new Float32Array(pulseHarmonicCount + 1);
  for (let harmonic = 1; harmonic <= pulseHarmonicCount; harmonic += 1) {
    const phase = 2 * Math.PI * harmonic * pulseDutyCycle;
    pulseReal[harmonic] = (2 * Math.sin(phase)) / (Math.PI * harmonic);
    pulseImaginary[harmonic] = (2 * (1 - Math.cos(phase))) / (Math.PI * harmonic);
  }
  const noteTimes = [];
  // 28セル分の回復音を明示的に作る。浮動小数点の比較で
  // 最終セルの音が抜けると、完了音までの間隔が133msに伸びる。
  if (noteCount > 0) {
    for (let step = 0; step * soundIntervalSeconds <= recoveryDurationSeconds + 0.000001; step += 1) {
      noteTimes.push(recoveryStart + step * soundIntervalSeconds);
    }
    noteTimes.push(recoveryStart + recoveryDurationSeconds + soundIntervalSeconds);
  }

  const createLimiter = (startedAt) => {
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-3, startedAt);
    limiter.knee.setValueAtTime(6, startedAt);
    limiter.ratio.setValueAtTime(12, startedAt);
    limiter.attack.setValueAtTime(0.003, startedAt);
    limiter.release.setValueAtTime(0.08, startedAt);
    return limiter;
  };

  const createFilterChain = (startedAt) => {
    const settings = [];
    if (soundSettings.highpassEnabled) {
      settings.push({
        type: "highpass",
        frequency: soundSettings.highpassFrequency,
        q: soundSettings.highpassQ,
        gain: 0,
      });
    }
    if (soundSettings.lowpassEnabled) {
      settings.push({
        type: "lowpass",
        frequency: soundSettings.lowpassFrequency,
        q: soundSettings.lowpassQ,
        gain: 0,
      });
    }
    settings.push(
      {
        type: soundSettings.eqLowType,
        frequency: soundSettings.eqLowFrequency,
        q: soundSettings.eqLowQ,
        gain: soundSettings.eqLowGain,
      },
      {
        type: soundSettings.eqMidType,
        frequency: soundSettings.eqMidFrequency,
        q: soundSettings.eqMidQ,
        gain: soundSettings.eqMidGain,
      },
      {
        type: soundSettings.eqHighType,
        frequency: soundSettings.eqHighFrequency,
        q: soundSettings.eqHighQ,
        gain: soundSettings.eqHighGain,
      },
    );
    const filters = settings.map(({ type, frequency, q, gain }) => {
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.setValueAtTime(frequency, startedAt);
      filter.Q.setValueAtTime(q, startedAt);
      filter.gain.setValueAtTime(gain, startedAt);
      return filter;
    });
    filters.slice(0, -1).forEach((filter, index) => filter.connect(filters[index + 1]));
    return { input: filters[0], output: filters.at(-1) };
  };

  noteTimes.forEach((startedAt) => {
    const filterChain = createFilterChain(startedAt);
    const limiter = createLimiter(startedAt);
    filterChain.output.connect(limiter);
    limiter.connect(context.destination);

    [
      [soundSettings.frequency1, soundSettings.frequencyStep1, soundSettings.volume1],
      [soundSettings.frequency2, soundSettings.frequencyStep2, soundSettings.volume2],
    ].forEach(([frequency, frequencyStep, volume]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      if (soundSettings.waveform === "pulse") {
        oscillator.setPeriodicWave(context.createPeriodicWave(pulseReal, pulseImaginary));
      } else {
        oscillator.type = "sawtooth";
      }
      oscillator.frequency.setValueAtTime(frequency, startedAt);
      for (let step = 1; step <= 2; step += 1) {
        const stepAt = startedAt + pitchStepInterval * step;
        if (stepAt < startedAt + noteDuration) {
          oscillator.frequency.setValueAtTime(frequency + frequencyStep * step, stepAt);
        }
      }
      oscillator.connect(gain);
      gain.connect(filterChain.input);

      const stoppedAt = startedAt + noteDuration;
      const attackSeconds = Math.min(attack, noteDuration);
      const releaseSeconds = Math.min(release, Math.max(0, noteDuration - attackSeconds));
      const decaySeconds = Math.min(
        decay,
        Math.max(0, noteDuration - attackSeconds - releaseSeconds),
      );
      const attackEndsAt = startedAt + attackSeconds;
      const decayEndsAt = attackEndsAt + decaySeconds;
      const releaseStartsAt = Math.max(decayEndsAt, stoppedAt - releaseSeconds);
      const peak = Math.max(0.0001, volume);
      const sustain = Math.max(0.0001, peak * soundSettings.sustainLevel);
      gain.gain.setValueAtTime(0.0001, startedAt);
      if (attackSeconds > 0) {
        gain.gain.linearRampToValueAtTime(peak, attackEndsAt);
      } else {
        gain.gain.setValueAtTime(peak, startedAt);
      }
      if (decaySeconds > 0) {
        gain.gain.linearRampToValueAtTime(sustain, decayEndsAt);
      } else {
        gain.gain.setValueAtTime(sustain, attackEndsAt);
      }
      gain.gain.setValueAtTime(sustain, releaseStartsAt);
      if (releaseSeconds > 0) {
        gain.gain.exponentialRampToValueAtTime(0.0001, stoppedAt);
      } else {
        gain.gain.setValueAtTime(0.0001, stoppedAt);
      }

      oscillator.start(startedAt);
      oscillator.stop(stoppedAt + disconnectDelay);
    });
  });

  return context.startRendering().then((rendered) => {
    const channel = rendered.getChannelData(0);
    const bytes = new Uint8Array(channel.buffer, channel.byteOffset, channel.byteLength);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
    }
    return { sampleRate, pcmFloat32Base64: btoa(binary) };
  });
}

function writeStandardRecoveryWav(outputPath, audioData) {
  const channel = Buffer.from(audioData.pcmFloat32Base64, "base64");
  const sampleCount = Math.floor(channel.length / 4);
  const channels = 2;
  const bytesPerSample = 2;
  const dataSize = sampleCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(audioData.sampleRate, 24);
  buffer.writeUInt32LE(audioData.sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const floatValue = channel.readFloatLE(sampleIndex * 4);
    const pcm = Math.round(Math.min(Math.max(floatValue, -1), 1) * 32767);
    const offset = 44 + sampleIndex * channels * bytesPerSample;
    buffer.writeInt16LE(pcm, offset);
    buffer.writeInt16LE(pcm, offset + bytesPerSample);
  }
  writeFileSync(outputPath, buffer);
}

async function renderStandardRecoveryAudio(client, outputPath) {
  const result = await client.send("Runtime.evaluate", {
    expression: `(${renderStandardRecoveryAudioInPage.toString()})(${DURATION_SECONDS}, ${RECOVERY_START}, ${SOUND_INTERVAL_SECONDS}, ${RECOVERY_DURATION_SECONDS}, ${RECOVERY_NOTE_COUNT}, ${JSON.stringify(SOUND_SETTINGS)})`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`標準回復音のオフラインレンダリングに失敗しました: ${result.exceptionDetails.text}`);
  }
  writeStandardRecoveryWav(outputPath, result.result?.value);
}

function writeAnalyzedBassBgm(outputPath) {
  // analysis/bass_cancellation_report.json とbass_note_segments.csvの実測値に基づく
  // C4(約261.8Hz)→B♭3(約232.0Hz)の「C C C B♭」型を反復する。
  const sampleRate = 48_000;
  const channels = 2;
  const bytesPerSample = 2;
  const sampleCount = Math.round(DURATION_SECONDS * sampleRate);
  const dataSize = sampleCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  const cycleSeconds = 0.4;
  const noteSeconds = 0.1;
  const bassNotes = [
    { frequency: 261.8, gain: 0.085 },
    { frequency: 261.8, gain: 0.085 },
    { frequency: 261.8, gain: 0.085 },
    { frequency: 232.0, gain: 0.095 },
  ];

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const time = sampleIndex / sampleRate;
    const position = time % cycleSeconds;
    const noteIndex = Math.floor(position / noteSeconds);
    const localTime = position - noteIndex * noteSeconds;
    const note = bassNotes[noteIndex];
    const attack = Math.min(localTime / 0.008, 1);
    const release = Math.min((noteSeconds - localTime) / 0.018, 1);
    const envelope = attack * release;
    const phase = localTime * note.frequency;
    const fundamental = Math.sin(2 * Math.PI * phase);
    // ユーザー指定どおり、BGMは解析した基音だけにする。
    // 倍音、ノイズ、空気感レイヤー、非線形サチュレーションは加えない。
    const sample = fundamental * note.gain * envelope * 0.78;
    const pcm = Math.round(Math.min(Math.max(sample, -1), 1) * 32767);
    const offset = 44 + sampleIndex * channels * bytesPerSample;
    buffer.writeInt16LE(pcm, offset);
    buffer.writeInt16LE(pcm, offset + bytesPerSample);
  }

  writeFileSync(outputPath, buffer);
}

async function run() {
  if (!CHROME) {
    throw new Error("ChromeまたはEdgeが見つかりません。録画機能には対応ブラウザが必要です。");
  }
  if (!FFMPEG) {
    throw new Error("ffmpegが見つかりません。録画機能にはffmpegが必要です。");
  }
  const port = await findOpenPort();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "usage_meter_actual_demo_"));
  const profileDir = path.join(tempRoot, "chrome-profile");
  const framesDir = path.join(tempRoot, "frames");
  await mkdir(profileDir);
  await mkdir(framesDir);

  const chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-gpu",
    "--disable-sync",
    "--hide-scrollbars",
    "--no-first-run",
    "--remote-allow-origins=*",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    SOURCE_URL,
  ], { stdio: ["ignore", "ignore", "ignore"] });

  let client = null;
  let consumeWarning = null;
  try {
    const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    const page = targets.find((target) => target.type === "page");
    if (!page?.webSocketDebuggerUrl) {
      throw new Error("描画対象のChromeページが見つかりませんでした。");
    }

    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const ready = await client.send("Runtime.evaluate", {
        expression: "document.readyState === 'complete' && typeof window.setAiUsage === 'function'",
        returnByValue: true,
      });
      if (ready.result?.value === true) {
        break;
      }
      if (attempt === 99) {
        throw new Error("使用量メーターの読み込みが完了しませんでした。");
      }
      await delay(100);
    }

    let startingCredits = null;
    for (let attempt = 0; !SAFE_RECORDING && attempt < 150; attempt += 1) {
      const liveUsage = await client.send("Runtime.evaluate", {
        expression: `(() => {
          const meter = document.querySelector(".energy-meter");
          const label = document.querySelector("#resetCounter")?.getAttribute("aria-label") || "";
          const matched = label.match(${CREDIT_LABEL_PATTERN_SOURCE});
          if (Number(meter?.getAttribute("aria-valuemax")) !== 100 || !matched) {
            return null;
          }
          return Number(matched[1]);
        })()`,
        returnByValue: true,
      });
      const credits = liveUsage.result?.value;
      if (Number.isFinite(credits) && (!CONSUME_CREDIT || credits > 0)) {
        startingCredits = credits;
        break;
      }
      if (attempt === 149) {
        throw new Error("実アカウントの使用量またはリセットクレジットを読み込めませんでした。");
      }
      await delay(100);
    }

    const setup = await client.send("Runtime.evaluate", {
      expression: `(${setupVideoScreen.toString()})(${RECOVERY_START}, ${RECOVERY_START + RECOVERY_DURATION_SECONDS}, ${RECOVERY_START + RECOVERY_DURATION_SECONDS + SOUND_INTERVAL_SECONDS + 0.5}, ${RECORDING_STATE.showStockPanel})`,
      returnByValue: true,
    });
    if (setup.exceptionDetails) {
      throw new Error(`動画用画面の初期化に失敗しました: ${setup.exceptionDetails.text}`);
    }

    if (CONSUME_CREDIT) {
      await startActualReset(client);
    }

    const finalState = await captureFrames(client, framesDir);
    // 実消費後は動画を必ず書き出す。検証は失敗しても中断せず警告として残す。
    if (CONSUME_CREDIT) {
      const remainingCredits = Number(
        CREDIT_LABEL_PATTERN.exec(finalState?.creditsLabel ?? "")?.[1],
      );
      const completed = finalState?.remaining === finalState?.total
        && remainingCredits === startingCredits - 1;
      if (!completed) {
        consumeWarning = `週枠リセットの完了を確認できませんでした: ${JSON.stringify({
          ...finalState,
          startingCredits,
        })}`;
      }
    }
    const previewIndex = Math.min(
      FRAME_COUNT - 1,
      Math.round((RECOVERY_START + RECOVERY_DURATION_SECONDS + 0.45) * FPS),
    );
    if (OUTPUT_PREVIEW) {
      await copyFile(
        path.join(framesDir, `frame_${String(previewIndex).padStart(4, "0")}.png`),
        OUTPUT_PREVIEW,
      );
    }
    const recoveryAudioPath = path.join(framesDir, "standard_recovery.wav");
    await renderStandardRecoveryAudio(client, recoveryAudioPath);
    encodeVideo(framesDir, recoveryAudioPath);
  } finally {
    client?.close();
    chrome.kill("SIGTERM");
    await rm(tempRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 150,
    });
  }

  console.log(`動画: ${OUTPUT_VIDEO}`);
  if (OUTPUT_PREVIEW) {
    console.log(`プレビュー: ${OUTPUT_PREVIEW}`);
  }
  if (consumeWarning) {
    console.warn(`警告: ${consumeWarning}`);
  }
}

run().catch((error) => {
  console.error(`生成に失敗しました: ${error.message}`);
  process.exitCode = 1;
});

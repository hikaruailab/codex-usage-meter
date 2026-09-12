const PAGE_PARAMS = new URLSearchParams(location.search);
const DEMO_MODE = document.body?.dataset.live === "false"
  || PAGE_PARAMS.get("demo") === "1";
const LIVE_MODE = !DEMO_MODE;
const STANDALONE_WINDOW = PAGE_PARAMS.get("standalone") === "1";
const SETTINGS_WINDOW = PAGE_PARAMS.get("settings") === "1";
const STORAGE_KEY = LIVE_MODE ? "aiUsageMeter" : "aiUsageMeter.demo";
const DEBUG_STORAGE_KEY = LIVE_MODE
  ? "aiUsageMeterDebug.standard-v2"
  : "aiUsageMeter.demoDebug.standard-v2";
const DEBUG_SECTIONS_STORAGE_KEY = LIVE_MODE
  ? "aiUsageMeterDebugSections"
  : "aiUsageMeter.demoDebugSections";
const DEFAULT_TOTAL = 28;
const DEFAULT_DESIGN = "classic";
const MEMORY_COUNT = 28;
const EQ_FILTER_TYPES = ["peaking", "lowshelf", "highshelf"];
const WAVEFORM_TYPES = ["sawtooth", "pulse"];
const EQ_GRAPH_MIN_DB = -36;
const EQ_GRAPH_MAX_DB = 36;
const EQ_HANDLE_SETTINGS = Object.freeze({
  low: {
    label: "LOW",
    type: "eqLowType",
    frequency: "eqLowFrequency",
    gain: "eqLowGain",
    q: "eqLowQ",
  },
  mid: {
    label: "MID",
    type: "eqMidType",
    frequency: "eqMidFrequency",
    gain: "eqMidGain",
    q: "eqMidQ",
  },
  high: {
    label: "HIGH",
    type: "eqHighType",
    frequency: "eqHighFrequency",
    gain: "eqHighGain",
    q: "eqHighQ",
  },
});
const EQ_COMPONENT_NAMES = ["highpass", "lowpass", ...Object.keys(EQ_HANDLE_SETTINGS)];
const DEFAULT_DEBUG_SETTINGS = Object.freeze({
  bgmEnabled: true,
  recordingEnabled: false,
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
const DEBUG_SETTING_LIMITS = {
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
  eqLowGain: [EQ_GRAPH_MIN_DB, EQ_GRAPH_MAX_DB],
  eqLowQ: [0.2, 8],
  eqMidFrequency: [500, 8000],
  eqMidGain: [EQ_GRAPH_MIN_DB, EQ_GRAPH_MAX_DB],
  eqMidQ: [0.2, 8],
  eqHighFrequency: [2000, 16000],
  eqHighGain: [EQ_GRAPH_MIN_DB, EQ_GRAPH_MAX_DB],
  eqHighQ: [0.2, 8],
};
const PIXEL_GLYPHS = {
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  x: ["00000", "10001", "01010", "00100", "01010", "10001", "00000"],
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  6: ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
};
const USAGE_ENDPOINT = LIVE_MODE
  ? (location.protocol === "file:" ? "http://127.0.0.1:4317/api/usage" : "/api/usage")
  : null;
const USAGE_RESET_ENDPOINT = LIVE_MODE
  ? (location.protocol === "file:" ? "http://127.0.0.1:4317/api/usage/reset" : "/api/usage/reset")
  : null;
const RECORDING_ENDPOINT = location.protocol === "file:"
  ? "http://127.0.0.1:4317/api/recordings"
  : "/api/recordings";
const RECORDING_STATUS_STORAGE_KEY = LIVE_MODE
  ? "aiUsageMeterRecordingStatus"
  : "aiUsageMeter.demoRecordingStatus";
const USAGE_REFRESH_INTERVAL_MS = 15_000;
const RESET_CREDIT_URGENT_MS = 12 * 60 * 60 * 1000;
const BASE_WINDOW_WIDTH = 234;
const BASE_WINDOW_HEIGHT = 450;
const DESIGNS = {
  classic: ["#fff9a8", "#f4dc35", "#9a6a00"],
  blue: ["#d7f9ff", "#4fd8ff", "#1166c8"],
  red: ["#fff0c4", "#ff4c4c", "#aa121a"],
  green: ["#eaffdf", "#6cff72", "#17993d"],
  purple: ["#f5e7ff", "#b878ff", "#6234c7"],
};

const elements = {
  usageWidget: document.querySelector(".usage-widget"),
  settingsButton: document.querySelector("#settingsButton"),
  energyFrame: document.querySelector(".energy-frame"),
  energyMeter: document.querySelector(".energy-meter"),
  energyCells: document.querySelector("#energyCells"),
  designPicker: document.querySelector("#designPicker"),
  energyCanArea: document.querySelector(".energy-can-area"),
  energyCanButton: document.querySelector(".energy-can-button"),
  demoLabel: document.querySelector("#demoLabel"),
  resetCounter: document.querySelector("#resetCounter"),
  resetExpiryPanel: document.querySelector("#resetExpiryTooltip"),
  resetExpiryList: document.querySelector("#resetExpiryList"),
  debugPanel: document.querySelector("#debugPanel"),
  debugMemoryStatus: document.querySelector("#debugMemoryStatus"),
  debugSoundStatus: document.querySelector("#debugSoundStatus"),
  recordingStatus: document.querySelector("#recordingStatus"),
  eqGraph: document.querySelector("#eqGraph"),
  continuousStartButton: document.querySelector('[data-debug-action="continuous-start"]'),
  continuousStopButton: document.querySelector('[data-debug-action="continuous-stop"]'),
};

const state = loadState();
const debugSettings = loadDebugSettings();
let recoveryTimer = null;
let soundTimer = null;
let usageRefreshTimer = null;
let isRecovering = false;
let isActualResetPending = false;
let audioContext = null;
let renderedResetCredits = null;
let debugSoundCount = 0;
let displayedEqResponse = null;
let eqAnimationFrame = null;
let draggedEqHandle = null;
let continuousSound = null;
let bassBgm = null;
let delayedRecoveryTimer = null;
let isResetCreditPanelOpen = false;
let standaloneResizeFrame = null;
let settingsWindowHandle = null;
let activeRecordingJobId = null;
const pulseWaveCache = new WeakMap();

const BASS_BGM_NOTES = Object.freeze([
  { frequency: 261.8, gain: 0.085 },
  { frequency: 261.8, gain: 0.085 },
  { frequency: 261.8, gain: 0.085 },
  { frequency: 232.0, gain: 0.095 },
]);
const BASS_BGM_GAIN_MULTIPLIER = 3.0;
const BASS_BGM_NOTE_SECONDS = 0.1;
const BASS_BGM_START_DELAY_MS = 1_000;
const BASS_BGM_STOP_DELAY_MS = 500;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPositiveInteger(value, fallback) {
  const parsed = toInteger(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function toNonNegativeInteger(value, fallback) {
  const parsed = toInteger(value, fallback);
  return parsed >= 0 ? parsed : fallback;
}

function normalizeResetCreditExpirations(values, count) {
  const normalized = Array.isArray(values)
    ? values.slice(0, count).map((value) => {
      const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
      return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
    })
    : [];

  while (normalized.length < count) {
    normalized.push(null);
  }
  return normalized;
}

function normalizeResetCreditExpirationSource(value) {
  return ["api", "config", "unavailable"].includes(value) ? value : "unavailable";
}

function normalizeDesign(value) {
  return Object.prototype.hasOwnProperty.call(DESIGNS, value) ? value : DEFAULT_DESIGN;
}

function normalizeDebugSetting(name, value, fallback = DEFAULT_DEBUG_SETTINGS[name]) {
  if (name.endsWith("Enabled")) {
    if (value === true || value === "true") {
      return true;
    }
    if (value === false || value === "false") {
      return false;
    }
    return fallback;
  }

  if (name.endsWith("Type")) {
    return EQ_FILTER_TYPES.includes(value) ? value : fallback;
  }

  if (name === "waveform") {
    return WAVEFORM_TYPES.includes(value) ? value : fallback;
  }

  const parsed = Number.parseFloat(value);
  const [min, max] = DEBUG_SETTING_LIMITS[name];
  return clamp(Number.isFinite(parsed) ? parsed : fallback, min, max);
}

function loadDebugSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEBUG_STORAGE_KEY) || "{}");
    return Object.fromEntries(
      Object.keys(DEFAULT_DEBUG_SETTINGS).map((name) => [
        name,
        normalizeDebugSetting(
          name,
          saved[name] ?? (name === "recoveryIntervalMs" ? saved.stepIntervalMs : undefined),
          DEFAULT_DEBUG_SETTINGS[name],
        ),
      ]),
    );
  } catch (error) {
    console.warn("設定を読み込めませんでした。初期値を使います。", error);
    return { ...DEFAULT_DEBUG_SETTINGS };
  }
}

function saveDebugSettings() {
  localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(debugSettings));
}

function applySettingsSnapshot(snapshot, target, fallback) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return;
  }
  Object.keys(DEFAULT_DEBUG_SETTINGS).forEach((name) => {
    const legacyValue = name === "recoveryIntervalMs" ? snapshot.stepIntervalMs : undefined;
    target[name] = normalizeDebugSetting(name, snapshot[name] ?? legacyValue, fallback[name]);
  });
}

function syncSettingsFromStorage(rawValue, target, fallback) {
  try {
    applySettingsSnapshot(JSON.parse(rawValue || "{}"), target, fallback);
  } catch (error) {
    console.warn("別ウィンドウの設定を反映できませんでした。", error);
  }
}

function saveDebugSectionState() {
  const openSections = [...elements.debugPanel.querySelectorAll("[data-debug-section]")]
    .filter((section) => section.open)
    .map((section) => section.dataset.debugSection);
  localStorage.setItem(DEBUG_SECTIONS_STORAGE_KEY, JSON.stringify(openSections));
}

function initializeDebugSections() {
  const sections = [...elements.debugPanel.querySelectorAll("[data-debug-section]")];
  try {
    const saved = JSON.parse(localStorage.getItem(DEBUG_SECTIONS_STORAGE_KEY) || "null");
    if (Array.isArray(saved)) {
      sections.forEach((section) => {
        section.open = saved.includes(section.dataset.debugSection);
      });
    }
  } catch (error) {
    console.warn("メニューの開閉状態を読み込めませんでした。", error);
  }

  sections.forEach((section) => {
    section.addEventListener("toggle", saveDebugSectionState);
  });
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const total = toPositiveInteger(saved.total, DEFAULT_TOTAL);
    const remaining = clamp(toNonNegativeInteger(saved.remaining, total), 0, total);

    const resetCredits = LIVE_MODE ? toNonNegativeInteger(saved.resetCredits, 0) : 0;
    return {
      total,
      remaining,
      design: normalizeDesign(saved.design),
      resetCredits,
      resetCreditExpirations: LIVE_MODE
        ? normalizeResetCreditExpirations(saved.resetCreditExpirations, resetCredits)
        : [],
      resetCreditExpirationSource: LIVE_MODE
        ? normalizeResetCreditExpirationSource(saved.resetCreditExpirationSource)
        : "unavailable",
    };
  } catch (error) {
    console.warn("使用量メーターの保存データを読み込めませんでした。初期値で開始します。", error);
    return {
      total: DEFAULT_TOTAL,
      remaining: DEFAULT_TOTAL,
      design: DEFAULT_DESIGN,
      resetCredits: 0,
      resetCreditExpirations: [],
      resetCreditExpirationSource: "unavailable",
    };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function buildCells() {
  elements.energyCells.replaceChildren();

  for (let index = 0; index < MEMORY_COUNT; index += 1) {
    const cell = document.createElement("img");
    cell.className = "energy-cell";
    cell.src = "./meter_cell.png";
    cell.alt = "";
    cell.width = 12;
    cell.height = 2;
    cell.draggable = false;
    elements.energyCells.append(cell);
  }
}

function buildDesignPicker() {
  elements.designPicker.replaceChildren();

  Object.entries(DESIGNS).forEach(([name, colors]) => {
    const button = document.createElement("button");
    button.className = "design-option";
    button.type = "button";
    button.dataset.design = name;
    button.setAttribute("aria-label", `${name}デザイン`);
    button.style.setProperty("--option-light", colors[0]);
    button.style.setProperty("--option-fill", colors[1]);
    button.style.setProperty("--option-dark", colors[2]);
    elements.designPicker.append(button);
  });
}

function renderDesign() {
  document.body.dataset.design = state.design;

  elements.designPicker.querySelectorAll(".design-option").forEach((button) => {
    const isSelected = button.dataset.design === state.design;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function renderPixelText(element, text) {
  const fragment = document.createDocumentFragment();
  for (const character of text) {
    const glyph = document.createElement("span");
    glyph.className = "pixel-character";
    glyph.setAttribute("aria-hidden", "true");

    const pattern = PIXEL_GLYPHS[character] ?? PIXEL_GLYPHS[0];
    for (const row of pattern) {
      for (const bit of row) {
        const pixel = document.createElement("span");
        pixel.className = bit === "1" ? "pixel is-on" : "pixel";
        glyph.append(pixel);
      }
    }

    fragment.append(glyph);
  }

  element.replaceChildren(fragment);
}

function getResetCreditRemainingMs(expiration) {
  const timestamp = typeof expiration === "string" ? Date.parse(expiration) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp - Date.now() : Number.POSITIVE_INFINITY;
}

function isUrgentResetCredit(expiration) {
  const remainingMs = getResetCreditRemainingMs(expiration);
  return remainingMs > 0 && remainingMs < RESET_CREDIT_URGENT_MS;
}

function formatResetCreditExpiration(expiration) {
  const date = new Date(expiration);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderResetCreditExpirations() {
  const fragment = document.createDocumentFragment();

  if (state.resetCredits === 0) {
    const empty = document.createElement("span");
    empty.className = "reset-expiry-empty";
    empty.textContent = "E缶なし";
    fragment.append(empty);
  } else {
    state.resetCreditExpirations.forEach((expiration) => {
      const row = document.createElement("div");
      row.className = "reset-expiry-row";
      row.classList.toggle("is-urgent", isUrgentResetCredit(expiration));

      const icon = document.createElement("img");
      icon.className = "reset-expiry-icon";
      icon.src = "./reset_credit_icon.png";
      icon.alt = "";
      icon.width = 18;
      icon.height = 18;

      const label = document.createElement("time");
      if (expiration) {
        label.dateTime = expiration;
        label.textContent = formatResetCreditExpiration(expiration);
      } else {
        label.textContent = "期限情報なし";
      }

      row.append(icon, label);
      fragment.append(row);
    });
  }

  elements.resetExpiryList.replaceChildren(fragment);
}

function renderResetCredits() {
  const count = state.resetCredits;
  const hasUrgentCredit = state.resetCreditExpirations.some(isUrgentResetCredit);
  const renderSignature = JSON.stringify([
    count,
    state.resetCreditExpirations,
    state.resetCreditExpirationSource,
    hasUrgentCredit,
  ]);
  if (renderSignature === renderedResetCredits) {
    return;
  }

  renderPixelText(elements.resetCounter, `x${count}`);
  renderResetCreditExpirations();
  elements.energyCanArea.classList.toggle("has-urgent-expiry", hasUrgentCredit);
  const urgentLabel = hasUrgentCredit ? "。12時間以内に期限切れになるE缶があります" : "";
  elements.resetCounter.setAttribute(
    "aria-label",
    `E缶 ${count}個${urgentLabel}。E缶にマウスオーバーすると残量と有効期限を${isResetCreditPanelOpen ? "表示中です" : "表示します"}`,
  );
  renderedResetCredits = renderSignature;
  if (isResetCreditPanelOpen) {
    resizeStandaloneWindow();
  }
}

function resizeStandaloneWindow() {
  if (standaloneResizeFrame !== null) {
    window.cancelAnimationFrame(standaloneResizeFrame);
  }
  standaloneResizeFrame = window.requestAnimationFrame(() => {
    standaloneResizeFrame = null;
    const panelExtra = isResetCreditPanelOpen
      ? Math.min(elements.resetExpiryPanel.offsetHeight + 24, 250)
      : 0;
    elements.usageWidget.style.setProperty("--credit-panel-extra", `${panelExtra}px`);
    document.documentElement.style.setProperty("--credit-panel-extra", `${panelExtra}px`);
    if (STANDALONE_WINDOW && typeof window.resizeTo === "function") {
      const contentWidth = Math.ceil(elements.usageWidget.getBoundingClientRect().width);
      const browserFrameWidth = Math.max(0, window.outerWidth - window.innerWidth);
      const browserFrameHeight = Math.max(0, window.outerHeight - window.innerHeight);
      window.resizeTo(
        Math.max(BASE_WINDOW_WIDTH, contentWidth) + browserFrameWidth,
        BASE_WINDOW_HEIGHT + panelExtra + browserFrameHeight,
      );
    }
  });
}

function toggleResetCreditPanel(forceOpen) {
  isResetCreditPanelOpen = forceOpen ?? !isResetCreditPanelOpen;
  elements.resetExpiryPanel.hidden = !isResetCreditPanelOpen;
  elements.energyCanArea.classList.toggle("is-expanded", isResetCreditPanelOpen);
  elements.usageWidget.classList.toggle("credits-open", isResetCreditPanelOpen);
  document.documentElement.classList.toggle("credits-open", isResetCreditPanelOpen);
  document.body.classList.toggle("credits-open", isResetCreditPanelOpen);
  elements.resetCounter.setAttribute("aria-expanded", String(isResetCreditPanelOpen));
  renderedResetCredits = null;
  renderResetCredits();
  resizeStandaloneWindow();
}

function setDemoVisible(isVisible) {
  elements.demoLabel.hidden = !isVisible;
}

function render() {
  const ratio = state.total > 0 ? state.remaining / state.total : 0;
  const filledMemoryCount = Math.round(ratio * MEMORY_COUNT);
  const cells = [...elements.energyCells.children];

  cells.forEach((cell, index) => {
    const isFilled = index < filledMemoryCount;
    cell.classList.toggle("is-filled", isFilled);
    cell.classList.toggle("is-danger", isFilled && ratio <= 0.2);
  });

  elements.energyMeter.setAttribute("aria-valuemax", String(state.total));
  elements.energyMeter.setAttribute("aria-valuenow", String(state.remaining));
  elements.energyMeter.style.setProperty("--meter-height", `${ratio * 100}%`);
  elements.energyMeter.classList.toggle("is-danger", state.remaining > 0 && ratio <= 0.2);
  renderDesign();
  renderResetCredits();
  updateDebugMonitor(filledMemoryCount);
}

function setUsage(nextState) {
  const nextTotal = toPositiveInteger(nextState.total, state.total);
  const nextRemaining = clamp(toNonNegativeInteger(nextState.remaining, state.remaining), 0, nextTotal);

  state.total = nextTotal;
  state.remaining = nextRemaining;
  state.design = normalizeDesign(nextState.design ?? state.design);
  state.resetCredits = toNonNegativeInteger(nextState.resetCredits, state.resetCredits);
  state.resetCreditExpirations = normalizeResetCreditExpirations(
    nextState.resetCreditExpirations ?? state.resetCreditExpirations,
    state.resetCredits,
  );
  state.resetCreditExpirationSource = normalizeResetCreditExpirationSource(
    nextState.resetCreditExpirationSource ?? state.resetCreditExpirationSource,
  );

  saveState();
  render();
}

function consumeUsage(cost) {
  const normalizedCost = clamp(toPositiveInteger(cost, 1), 1, state.total);
  setUsage({
    total: state.total,
    remaining: Math.max(0, state.remaining - normalizedCost),
  });
}

function stopRecoveryAnimation({ keepBassBgm = false } = {}) {
  if (recoveryTimer !== null) {
    window.clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }

  if (soundTimer !== null) {
    window.clearTimeout(soundTimer);
    soundTimer = null;
  }

  if (delayedRecoveryTimer !== null) {
    window.clearTimeout(delayedRecoveryTimer);
    delayedRecoveryTimer = null;
  }

  if (!keepBassBgm) {
    stopBassBgm();
  }

  elements.energyCanButton.classList.remove("is-charging");
  elements.energyMeter.classList.remove("is-charging");
  setDemoVisible(false);
  isRecovering = false;
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  audioContext ??= new AudioContextClass();
  return audioContext;
}

function scheduleBassBgmWindow(sound) {
  const { context, oscillator, gain } = sound;
  const now = context.currentTime;
  const scheduleUntil = now + 0.25;

  while (sound.nextNoteAt < scheduleUntil) {
    const startedAt = sound.nextNoteAt;
    const stoppedAt = startedAt + BASS_BGM_NOTE_SECONDS;
    const note = BASS_BGM_NOTES[sound.noteIndex % BASS_BGM_NOTES.length];
    const noteGain = note.gain * BASS_BGM_GAIN_MULTIPLIER;
    const attackEndsAt = startedAt + 0.008;
    const releaseStartsAt = stoppedAt - 0.018;

    oscillator.frequency.setValueAtTime(note.frequency, startedAt);
    gain.gain.setValueAtTime(0.0001, startedAt);
    gain.gain.linearRampToValueAtTime(noteGain, attackEndsAt);
    gain.gain.setValueAtTime(noteGain, releaseStartsAt);
    gain.gain.linearRampToValueAtTime(0.0001, stoppedAt);

    sound.nextNoteAt += BASS_BGM_NOTE_SECONDS;
    sound.noteIndex += 1;
  }
}

function startBassBgm() {
  if (bassBgm) {
    return true;
  }

  const context = getAudioContext();
  if (!context || context.state === "closed") {
    return false;
  }
  if (context.state === "suspended") {
    context.resume().catch((error) => {
      console.warn("BGMを有効にできませんでした。", error);
    });
  }

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startedAt = context.currentTime + 0.01;
  const sound = {
    context,
    oscillator,
    gain,
    nextNoteAt: startedAt,
    noteIndex: 0,
    timerId: null,
  };

  oscillator.type = "sine";
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startedAt);
  bassBgm = sound;

  const schedule = () => {
    if (bassBgm !== sound) {
      return;
    }
    scheduleBassBgmWindow(sound);
    sound.timerId = window.setTimeout(schedule, 50);
  };
  schedule();
  return true;
}

function stopBassBgm() {
  const sound = bassBgm;
  if (!sound) {
    return;
  }

  bassBgm = null;
  if (sound.timerId !== null) {
    window.clearTimeout(sound.timerId);
  }

  const now = sound.context.currentTime;
  try {
    sound.gain.gain.cancelScheduledValues(now);
    sound.gain.gain.setValueAtTime(Math.max(sound.gain.gain.value, 0.0001), now);
    sound.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    sound.oscillator.stop(now + 0.04);
  } catch (error) {
    console.warn("BGMを停止できませんでした。", error);
  }
  sound.oscillator.addEventListener("ended", () => {
    sound.oscillator.disconnect();
    sound.gain.disconnect();
  }, { once: true });
}

function getPulsePeriodicWave(context, dutyCycle) {
  let contextCache = pulseWaveCache.get(context);
  if (!contextCache) {
    contextCache = new Map();
    pulseWaveCache.set(context, contextCache);
  }

  const cacheKey = dutyCycle.toFixed(3);
  if (contextCache.has(cacheKey)) {
    return contextCache.get(cacheKey);
  }

  const harmonicCount = 128;
  const real = new Float32Array(harmonicCount + 1);
  const imaginary = new Float32Array(harmonicCount + 1);
  for (let harmonic = 1; harmonic <= harmonicCount; harmonic += 1) {
    const phase = 2 * Math.PI * harmonic * dutyCycle;
    real[harmonic] = (2 * Math.sin(phase)) / (Math.PI * harmonic);
    imaginary[harmonic] = (2 * (1 - Math.cos(phase))) / (Math.PI * harmonic);
  }

  const wave = context.createPeriodicWave(real, imaginary);
  contextCache.set(cacheKey, wave);
  return wave;
}

function configureOscillatorWaveform(oscillator, context) {
  if (debugSettings.waveform === "pulse") {
    oscillator.setPeriodicWave(getPulsePeriodicWave(context, debugSettings.pulseDutyCycle));
  } else {
    oscillator.type = "sawtooth";
  }
}

function scheduleEnvelope(gainParam, startedAt, durationSeconds, peakVolume) {
  const attackSeconds = Math.min(debugSettings.attackMs / 1000, durationSeconds);
  const releaseSeconds = Math.min(
    debugSettings.releaseMs / 1000,
    Math.max(0, durationSeconds - attackSeconds),
  );
  const decaySeconds = Math.min(
    debugSettings.decayMs / 1000,
    Math.max(0, durationSeconds - attackSeconds - releaseSeconds),
  );
  const attackEndsAt = startedAt + attackSeconds;
  const decayEndsAt = attackEndsAt + decaySeconds;
  const stoppedAt = startedAt + durationSeconds;
  const releaseStartsAt = Math.max(decayEndsAt, stoppedAt - releaseSeconds);
  const peak = Math.max(0.0001, peakVolume);
  const sustain = Math.max(0.0001, peak * debugSettings.sustainLevel);

  gainParam.setValueAtTime(0.0001, startedAt);
  if (attackSeconds > 0) {
    gainParam.linearRampToValueAtTime(peak, attackEndsAt);
  } else {
    gainParam.setValueAtTime(peak, startedAt);
  }

  if (decaySeconds > 0) {
    gainParam.linearRampToValueAtTime(sustain, decayEndsAt);
  } else {
    gainParam.setValueAtTime(sustain, attackEndsAt);
  }

  gainParam.setValueAtTime(sustain, releaseStartsAt);
  if (releaseSeconds > 0) {
    gainParam.exponentialRampToValueAtTime(0.0001, stoppedAt);
  } else {
    gainParam.setValueAtTime(0.0001, stoppedAt);
  }
}

function scheduleOscillatorFrequency(
  oscillator,
  startedAt,
  durationSeconds,
  baseFrequency,
  frequencyStep,
) {
  oscillator.frequency.setValueAtTime(baseFrequency, startedAt);
  const intervalSeconds = debugSettings.pitchStepIntervalMs / 1000;
  if (intervalSeconds <= 0 || frequencyStep === 0) {
    return;
  }
  for (let step = 1; step <= 2; step += 1) {
    const stepAt = startedAt + intervalSeconds * step;
    if (stepAt >= startedAt + durationSeconds) {
      break;
    }
    oscillator.frequency.setValueAtTime(baseFrequency + frequencyStep * step, stepAt);
  }
}

function getEqBandFilterSettings() {
  return Object.entries(EQ_HANDLE_SETTINGS).map(([name, settings]) => ({
    name,
    type: debugSettings[settings.type],
    frequency: debugSettings[settings.frequency],
    q: debugSettings[settings.q],
    gain: debugSettings[settings.gain],
  }));
}

function getToneFilterSettings() {
  const filters = [];
  if (debugSettings.highpassEnabled) {
    filters.push({
      name: "highpass",
      type: "highpass",
      frequency: debugSettings.highpassFrequency,
      q: debugSettings.highpassQ,
      gain: 0,
    });
  }
  if (debugSettings.lowpassEnabled) {
    filters.push({
      name: "lowpass",
      type: "lowpass",
      frequency: debugSettings.lowpassFrequency,
      q: debugSettings.lowpassQ,
      gain: 0,
    });
  }
  return filters;
}

function getEqFilterSettings() {
  return getToneFilterSettings().concat(getEqBandFilterSettings());
}

function configureFilter(filter, settings, startedAt) {
  filter.type = settings.type;
  filter.frequency.setValueAtTime(settings.frequency, startedAt);
  filter.Q.setValueAtTime(settings.q, startedAt);
  filter.gain.setValueAtTime(settings.gain, startedAt);
}

function createAudioFilterChain(context, startedAt, settingsList = getEqFilterSettings()) {
  const filters = settingsList.map((settings) => {
    const filter = context.createBiquadFilter();
    configureFilter(filter, settings, startedAt);
    return filter;
  });

  filters.slice(0, -1).forEach((filter, index) => {
    filter.connect(filters[index + 1]);
  });

  return {
    filters,
    input: filters[0],
    output: filters.at(-1),
  };
}

function createAudioLimiter(context, startedAt) {
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-3, startedAt);
  limiter.knee.setValueAtTime(6, startedAt);
  limiter.ratio.setValueAtTime(12, startedAt);
  limiter.attack.setValueAtTime(0.003, startedAt);
  limiter.release.setValueAtTime(0.08, startedAt);
  return limiter;
}

function playRecoverySound() {
  const context = getAudioContext();
  if (!context || context.state === "closed") {
    return;
  }

  const startedAt = context.currentTime;
  const durationSeconds = debugSettings.noteDurationMs / 1000;
  const stoppedAt = startedAt + durationSeconds;
  const disconnectedAt = stoppedAt + debugSettings.disconnectDelayMs / 1000;
  const voices = [
    [debugSettings.frequency1, debugSettings.frequencyStep1, debugSettings.volume1],
    [debugSettings.frequency2, debugSettings.frequencyStep2, debugSettings.volume2],
  ];
  const filterChain = createAudioFilterChain(context, startedAt);
  const limiter = createAudioLimiter(context, startedAt);
  let activeVoices = voices.length;

  filterChain.output.connect(limiter);
  limiter.connect(context.destination);

  voices.forEach(([frequency, frequencyStep, volume]) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    configureOscillatorWaveform(oscillator, context);
    scheduleOscillatorFrequency(
      oscillator,
      startedAt,
      durationSeconds,
      frequency,
      frequencyStep,
    );
    oscillator.connect(gain);
    gain.connect(filterChain.input);
    scheduleEnvelope(gain.gain, startedAt, durationSeconds, volume);
    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      gain.disconnect();
      activeVoices -= 1;
      if (activeVoices === 0) {
        filterChain.filters.forEach((filter) => filter.disconnect());
        limiter.disconnect();
      }
    }, { once: true });
    oscillator.start(startedAt);
    oscillator.stop(disconnectedAt);
  });

  debugSoundCount += 1;
  updateDebugMonitor();
}

function syncContinuousSoundButtons() {
  const isActive = continuousSound !== null;
  elements.continuousStartButton.disabled = isActive;
  elements.continuousStopButton.disabled = !isActive;
}

function startContinuousSound() {
  if (continuousSound) {
    return;
  }

  const context = getAudioContext();
  if (!context || context.state === "closed") {
    return;
  }
  if (context.state === "suspended") {
    context.resume().catch((error) => {
      console.warn("連続再生を有効にできませんでした。", error);
    });
  }
  const sound = { timerId: null };
  const playNext = () => {
    if (continuousSound !== sound) {
      return;
    }
    playRecoverySound();
    sound.timerId = window.setTimeout(playNext, debugSettings.soundIntervalMs);
  };
  continuousSound = sound;
  syncContinuousSoundButtons();
  playNext();
}

function stopContinuousSound() {
  const sound = continuousSound;
  if (!sound) {
    return;
  }
  if (sound.timerId !== null) {
    window.clearTimeout(sound.timerId);
  }
  continuousSound = null;
  syncContinuousSoundButtons();
}

function startRecoverySoundLoop() {
  playRecoverySound();

  const scheduleNextSound = () => {
    soundTimer = window.setTimeout(() => {
      if (!isRecovering) {
        soundTimer = null;
        return;
      }

      playRecoverySound();
      scheduleNextSound();
    }, debugSettings.soundIntervalMs);
  };

  scheduleNextSound();
}

function stopRecoverySoundLoop() {
  if (soundTimer !== null) {
    window.clearTimeout(soundTimer);
    soundTimer = null;
  }
}

function startRecovery(options = {}) {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    context.resume().catch((error) => {
      console.warn("回復音を有効にできませんでした。", error);
    });
  }

  debugSoundCount = 0;
  animateRecovery({ keepBassBgm: options.keepBassBgm === true });
  setDemoVisible(options.demo === true);
}

function startRecoveryWithOptionalBgm(options = {}) {
  stopRecoveryAnimation();

  if (!debugSettings.bgmEnabled || !startBassBgm()) {
    startRecovery(options);
    return;
  }

  delayedRecoveryTimer = window.setTimeout(() => {
    delayedRecoveryTimer = null;
    startRecovery({ ...options, keepBassBgm: true });
  }, BASS_BGM_START_DELAY_MS);
}

function setRecordingStatus(message, status = "idle") {
  const payload = { message, status, updatedAt: Date.now() };
  localStorage.setItem(RECORDING_STATUS_STORAGE_KEY, JSON.stringify(payload));
  if (elements.recordingStatus) {
    elements.recordingStatus.textContent = message;
    elements.recordingStatus.dataset.status = status;
  }
}

function syncRecordingStatus(rawValue) {
  if (!elements.recordingStatus) return;
  try {
    const payload = JSON.parse(rawValue || "{}");
    if (typeof payload.message === "string") {
      elements.recordingStatus.textContent = payload.message;
      elements.recordingStatus.dataset.status = payload.status || "idle";
    }
  } catch {
    // 壊れた一時ステータスは表示せず、録画機能そのものは継続する。
  }
}

function downloadRecording(downloadUrl, fileName) {
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName || "usage-meter-recording.mp4";
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
}

async function waitForRecording(jobId) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    const response = await fetch(`${RECORDING_ENDPOINT}/${jobId}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
    if (result.status === "complete") {
      downloadRecording(result.downloadUrl, result.fileName);
      setRecordingStatus("回復完了後1秒までのMP4を保存しました。", "complete");
      return;
    }
    if (["failed", "cancelled"].includes(result.status)) {
      throw new Error(result.error ?? "録画を完了できませんでした。");
    }
  }
  throw new Error("録画の完了待ちがタイムアウトしました。");
}

async function recordNextRecovery() {
  if (activeRecordingJobId) {
    setRecordingStatus("録画処理中です。完了後にもう一度お試しください。", "busy");
    return;
  }
  setRecordingStatus("回復完了後1秒まで録画しています…", "recording");
  try {
    const response = await fetch(RECORDING_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total: state.total,
        remaining: state.remaining,
        resetCredits: state.resetCredits,
        resetCreditExpirations: state.resetCreditExpirations,
        resetCreditDisplayLabels: state.resetCreditExpirations.map((expiration) => (
          expiration ? formatResetCreditExpiration(expiration) : "期限情報なし"
        )),
        showStockPanel: true,
        design: state.design,
        bgmEnabled: debugSettings.bgmEnabled,
        settings: debugSettings,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
    activeRecordingJobId = result.id;
    await waitForRecording(result.id);
  } catch (error) {
    console.warn("録画を作成できませんでした。", error);
    setRecordingStatus(`録画できませんでした：${error.message}`, "failed");
  } finally {
    activeRecordingJobId = null;
  }
}

function startRecoveryWithRecording(options = {}) {
  if (debugSettings.recordingEnabled) void recordNextRecovery();
  startRecoveryWithOptionalBgm(options);
}

function createIdempotencyKey() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function useActualResetCredit() {
  if (!LIVE_MODE) {
    startRecoveryWithRecording({ demo: true });
    return;
  }

  if (isActualResetPending) {
    return;
  }
  if (state.resetCredits <= 0) {
    window.alert("使用できる週枠リセットがありません。");
    return;
  }

  // Shift＋E缶クリックは確認なしで、ただちに1クレジットを消費する。
  const previousRemaining = state.remaining;
  isActualResetPending = true;
  stopRecoveryAnimation();
  elements.energyCanButton.disabled = true;
  elements.energyCanButton.setAttribute("aria-busy", "true");

  try {
    const response = await fetch(USAGE_RESET_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Usage-Reset-Confirm": "consume",
      },
      body: JSON.stringify({ idempotencyKey: createIdempotencyKey() }),
      signal: AbortSignal.timeout(12_000),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error ?? `HTTP ${response.status}`);
    }

    if (result.outcome === "noCredit") {
      setUsage(result.usage);
      window.alert("使用できる週枠リセットがありません。");
      return;
    }
    if (result.outcome === "nothingToReset") {
      setUsage(result.usage);
      window.alert("現在の週枠はリセットの必要がありません。");
      return;
    }
    if (!["reset", "alreadyRedeemed"].includes(result.outcome)) {
      throw new Error(`不明な処理結果: ${result.outcome}`);
    }

    state.total = toPositiveInteger(result.usage.total, state.total);
    state.remaining = clamp(previousRemaining, 0, state.total);
    state.resetCredits = toNonNegativeInteger(result.usage.resetCredits, state.resetCredits);
    state.resetCreditExpirations = normalizeResetCreditExpirations(
      result.usage.resetCreditExpirations,
      state.resetCredits,
    );
    state.resetCreditExpirationSource = normalizeResetCreditExpirationSource(
      result.usage.resetCreditExpirationSource,
    );
    saveState();
    render();
    startRecoveryWithRecording({ demo: false });
  } catch (error) {
    console.warn("週枠の使用量リセットに失敗しました。", error);
    window.alert(`使用量をリセットできませんでした。\n${error.message}`);
    refreshCurrentUsage();
  } finally {
    isActualResetPending = false;
    elements.energyCanButton.disabled = false;
    elements.energyCanButton.removeAttribute("aria-busy");
  }
}

function animateRecovery({ keepBassBgm = false } = {}) {
  stopRecoveryAnimation({ keepBassBgm });
  let currentMemoryCount = Math.round((state.remaining / state.total) * MEMORY_COUNT);

  if (currentMemoryCount >= MEMORY_COUNT) {
    elements.energyCanButton.classList.add("is-charging");
    recoveryTimer = window.setTimeout(stopRecoveryAnimation, 360);
    return;
  }

  elements.energyCanButton.classList.add("is-charging");
  elements.energyMeter.classList.add("is-charging");
  isRecovering = true;
  startRecoverySoundLoop();

  const recoverStep = () => {
    currentMemoryCount = Math.min(MEMORY_COUNT, currentMemoryCount + 1);
    state.remaining = Math.round((currentMemoryCount / MEMORY_COUNT) * state.total);
    render();

    if (currentMemoryCount >= MEMORY_COUNT) {
      state.remaining = state.total;
      saveState();
      stopRecoverySoundLoop();
      recoveryTimer = window.setTimeout(() => {
        if (!isRecovering) {
          return;
        }
        playRecoverySound();
        recoveryTimer = window.setTimeout(() => {
          stopRecoveryAnimation();
          refreshCurrentUsage();
        }, BASS_BGM_STOP_DELAY_MS);
      }, debugSettings.soundIntervalMs);
      return;
    }

    recoveryTimer = window.setTimeout(recoverStep, debugSettings.recoveryIntervalMs);
  };

  recoverStep();
}

async function refreshCurrentUsage() {
  if (!LIVE_MODE) {
    return;
  }

  if (isRecovering) {
    return;
  }

  try {
    const response = await fetch(USAGE_ENDPOINT, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const usage = await response.json();
    if (!Number.isFinite(usage.remaining) || !Number.isFinite(usage.total)) {
      throw new TypeError("使用量データの形式が不正です。");
    }

    stopRecoveryAnimation();
    setUsage({
      total: usage.total,
      remaining: usage.remaining,
      resetCredits: usage.resetCredits,
      resetCreditExpirations: usage.resetCreditExpirations,
      resetCreditExpirationSource: usage.resetCreditExpirationSource,
    });
    setDemoVisible(false);
    elements.energyCanButton.setAttribute(
      "aria-label",
      "ゲージを回復。Shiftを押しながらクリックで週枠をリセット",
    );
  } catch (error) {
    console.warn("Codexの現在使用量を取得できませんでした。保存済みの値を表示します。", error);
    setDemoVisible(true);
    elements.energyCanButton.setAttribute(
      "aria-label",
      "ゲージを回復（Codex連携なしのデモ表示）",
    );
  }
}

function startUsageSync() {
  if (!LIVE_MODE) {
    setDemoVisible(true);
    elements.energyCanButton.setAttribute(
      "aria-label",
      "ゲージを回復（デモモード。外部APIは呼び出しません）",
    );
    return;
  }

  refreshCurrentUsage();
  usageRefreshTimer = window.setInterval(refreshCurrentUsage, USAGE_REFRESH_INTERVAL_MS);
}

function formatDebugValue(name, value) {
  if (["noteDurationMs", "recoveryIntervalMs", "soundIntervalMs", "attackMs", "decayMs", "releaseMs", "disconnectDelayMs", "pitchStepIntervalMs"].includes(name)) {
    const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return `${formatted} ms`;
  }
  if (name === "sustainLevel") {
    return `${Math.round(value * 100)}%`;
  }
  if (name.startsWith("volume")) {
    return value.toFixed(3);
  }
  if (name === "pulseDutyCycle") {
    return `${Math.round(value * 100)}%`;
  }
  if (name.endsWith("Gain")) {
    return `${value > 0 ? "+" : ""}${value.toFixed(1)} dB`;
  }
  return String(value);
}

function updateDebugMonitor(filledMemoryCount) {
  const currentMemoryCount = filledMemoryCount ?? Math.round(
    (state.remaining / state.total) * MEMORY_COUNT,
  );
  elements.debugMemoryStatus.textContent = `目盛り ${currentMemoryCount}/${MEMORY_COUNT}`;
  elements.debugSoundStatus.textContent = `発音 ${debugSoundCount}回`;
}

function syncEqTypeControls() {
  elements.debugPanel.querySelectorAll("[data-eq-type-setting]").forEach((button) => {
    const selected = debugSettings[button.dataset.eqTypeSetting] === button.dataset.eqTypeValue;
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("is-selected", selected);
  });

  [
    ["eqLowType", "eqLowQ"],
    ["eqMidType", "eqMidQ"],
    ["eqHighType", "eqHighQ"],
  ].forEach(([typeName, qName]) => {
    const qInput = elements.debugPanel.querySelector(`[data-debug-setting="${qName}"]`);
    qInput.disabled = debugSettings[typeName] !== "peaking";
  });
}

function syncFilterControls() {
  elements.debugPanel.querySelectorAll("[data-filter-enabled-setting]").forEach((button) => {
    const name = button.dataset.filterEnabledSetting;
    const selected = debugSettings[name] === (button.dataset.filterEnabledValue === "true");
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("is-selected", selected);
  });

  elements.debugPanel.querySelectorAll("[data-filter-dependent]").forEach((control) => {
    const enabled = debugSettings[control.dataset.filterDependent];
    control.classList.toggle("is-disabled", !enabled);
    control.querySelectorAll("input").forEach((input) => {
      input.disabled = !enabled;
    });
  });
}

function syncWaveformControls() {
  elements.debugPanel.querySelectorAll("[data-waveform-value]").forEach((button) => {
    const selected = debugSettings.waveform === button.dataset.waveformValue;
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("is-selected", selected);
  });
  elements.debugPanel.querySelectorAll("[data-waveform-dependent]").forEach((control) => {
    const enabled = debugSettings.waveform === "pulse";
    control.classList.toggle("is-disabled", !enabled);
    control.querySelectorAll("input").forEach((input) => {
      input.disabled = !enabled;
    });
  });
}

function createEqSvgElement(name, attributes = {}, text = "") {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  element.textContent = text;
  return element;
}

function ensureEqGraphStructure() {
  if (elements.eqGraph.querySelector(".eq-response")) {
    return;
  }

  const grid = createEqSvgElement("g", { class: "eq-grid" });
  const minFrequency = 20;
  const maxFrequency = 20000;
  const minDb = EQ_GRAPH_MIN_DB;
  const maxDb = EQ_GRAPH_MAX_DB;
  const left = 34;
  const top = 8;
  const width = 298;
  const height = 118;
  const mapX = (frequency) => left + (
    Math.log10(frequency / minFrequency) / Math.log10(maxFrequency / minFrequency)
  ) * width;
  const mapY = (db) => top + ((maxDb - db) / (maxDb - minDb)) * height;

  [-36, -24, -12, 0, 12, 24, 36].forEach((db) => {
    const y = mapY(db);
    grid.append(createEqSvgElement("line", { x1: left, y1: y, x2: left + width, y2: y }));
    grid.append(createEqSvgElement("text", { x: left - 5, y: y + 3, "text-anchor": "end" }, `${db}`));
  });

  [100, 400, 1000, 10000].forEach((frequency) => {
    const x = mapX(frequency);
    grid.append(createEqSvgElement("line", { x1: x, y1: top, x2: x, y2: top + height }));
    const label = frequency >= 1000 ? `${frequency / 1000}k` : String(frequency);
    grid.append(createEqSvgElement("text", { x, y: top + height + 15, "text-anchor": "middle" }, label));
  });

  const highpassCutoff = createEqSvgElement("line", {
    class: "eq-cutoff eq-cutoff-highpass",
    x1: 0,
    y1: top,
    x2: 0,
    y2: top + height,
  });
  const lowpassCutoff = createEqSvgElement("line", {
    class: "eq-cutoff eq-cutoff-lowpass",
    x1: 0,
    y1: top,
    x2: 0,
    y2: top + height,
  });
  const responseFill = createEqSvgElement("path", {
    class: "eq-response-fill",
    "aria-hidden": "true",
  });
  const componentResponses = EQ_COMPONENT_NAMES.map((name) => createEqSvgElement("path", {
    class: `eq-component-response eq-component-response-${name}`,
    "data-eq-component-response": name,
    "aria-hidden": "true",
  }));
  const response = createEqSvgElement("path", { class: "eq-response" });
  const title = createEqSvgElement("title", {}, "フィルターとEQの周波数特性");
  const handles = Object.entries(EQ_HANDLE_SETTINGS).map(([name, settings]) => {
    const handle = createEqSvgElement("g", {
      class: `eq-handle eq-handle-${name}`,
      "data-eq-handle": name,
      role: "button",
      tabindex: "0",
      "aria-label": `${settings.label} EQ操作点`,
    });
    handle.append(
      createEqSvgElement("circle", { cx: 0, cy: 0, r: 7 }),
      createEqSvgElement("text", {
        x: 0,
        y: 2.5,
        "text-anchor": "middle",
        "aria-hidden": "true",
      }, settings.label[0]),
      createEqSvgElement("title", {}, `${settings.label} EQ操作点`),
    );
    return handle;
  });

  elements.eqGraph.replaceChildren(
    title,
    grid,
    highpassCutoff,
    lowpassCutoff,
    responseFill,
    ...componentResponses,
    response,
    ...handles,
  );
}

function updateEqHandles() {
  const minFrequency = 20;
  const maxFrequency = 20000;
  const minDb = EQ_GRAPH_MIN_DB;
  const maxDb = EQ_GRAPH_MAX_DB;
  const left = 34;
  const top = 8;
  const width = 298;
  const height = 118;
  Object.entries(EQ_HANDLE_SETTINGS).forEach(([name, settings]) => {
    const handle = elements.eqGraph.querySelector(`[data-eq-handle="${name}"]`);
    const frequency = debugSettings[settings.frequency];
    const gain = debugSettings[settings.gain];
    const x = left + (
      Math.log10(frequency / minFrequency) / Math.log10(maxFrequency / minFrequency)
    ) * width;
    const y = top + ((maxDb - gain) / (maxDb - minDb)) * height;
    const description = `${settings.label}: ${Math.round(frequency)} Hz, ${gain > 0 ? "+" : ""}${gain.toFixed(1)} dB`;
    handle.setAttribute("transform", `translate(${x} ${y})`);
    handle.setAttribute("aria-label", description);
    handle.querySelector("title").textContent = description;
  });
}

function syncEqSettingInputs(settings) {
  [settings.frequency, settings.gain].forEach((name) => {
    const input = elements.debugPanel.querySelector(`[data-debug-setting="${name}"]`);
    const output = elements.debugPanel.querySelector(`[data-debug-output="${name}"]`);
    input.value = String(debugSettings[name]);
    if (output) {
      output.value = formatDebugValue(name, debugSettings[name]);
    }
  });
}

function setEqHandleValues(name, frequency, gain) {
  const settings = EQ_HANDLE_SETTINGS[name];
  debugSettings[settings.frequency] = normalizeDebugSetting(settings.frequency, frequency);
  debugSettings[settings.gain] = normalizeDebugSetting(settings.gain, gain);
  saveDebugSettings();
  syncEqSettingInputs(settings);
  drawEqGraph(false);
}

function updateEqHandleFromPointer(event) {
  const settings = EQ_HANDLE_SETTINGS[draggedEqHandle];
  if (!settings) {
    return;
  }

  const rect = elements.eqGraph.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  const left = 34;
  const top = 8;
  const width = 298;
  const height = 118;
  const svgX = ((event.clientX - rect.left) / rect.width) * 340;
  const svgY = ((event.clientY - rect.top) / rect.height) * 150;
  const frequencyRatio = clamp((svgX - left) / width, 0, 1);
  const frequency = 20 * (20000 / 20) ** frequencyRatio;
  const gain = EQ_GRAPH_MAX_DB - (
    (svgY - top) / height
  ) * (EQ_GRAPH_MAX_DB - EQ_GRAPH_MIN_DB);
  const roundedFrequency = Math.round(frequency / 10) * 10;
  const roundedGain = Math.round(clamp(gain, EQ_GRAPH_MIN_DB, EQ_GRAPH_MAX_DB) * 2) / 2;
  setEqHandleValues(draggedEqHandle, roundedFrequency, roundedGain);
}

function updateFilterCutoffLines() {
  const minFrequency = 20;
  const maxFrequency = 20000;
  const left = 34;
  const width = 298;
  const mapX = (frequency) => left + (
    Math.log10(frequency / minFrequency) / Math.log10(maxFrequency / minFrequency)
  ) * width;
  [
    [".eq-cutoff-highpass", "highpassEnabled", "highpassFrequency"],
    [".eq-cutoff-lowpass", "lowpassEnabled", "lowpassFrequency"],
  ].forEach(([selector, enabledName, frequencyName]) => {
    const line = elements.eqGraph.querySelector(selector);
    const x = mapX(debugSettings[frequencyName]);
    line.setAttribute("x1", String(x));
    line.setAttribute("x2", String(x));
    line.setAttribute("visibility", debugSettings[enabledName] ? "visible" : "hidden");
  });
}

function calculateEqResponses() {
  const OfflineContextClass = window.OfflineAudioContext ?? window.webkitOfflineAudioContext;
  if (!OfflineContextClass) {
    return null;
  }

  const context = new OfflineContextClass(1, 1, 44100);
  const pointCount = 192;
  const frequencies = new Float32Array(pointCount);
  const minFrequency = 20;
  const maxFrequency = 20000;

  for (let index = 0; index < pointCount; index += 1) {
    frequencies[index] = minFrequency * (maxFrequency / minFrequency) ** (index / (pointCount - 1));
  }

  const calculateResponse = (filterSettings) => {
    const totalDb = new Float32Array(pointCount);
    filterSettings.forEach((settings) => {
      const filter = context.createBiquadFilter();
      filter.type = settings.type;
      filter.frequency.value = settings.frequency;
      filter.Q.value = settings.q;
      filter.gain.value = settings.gain;
      const magnitude = new Float32Array(pointCount);
      const phase = new Float32Array(pointCount);
      filter.getFrequencyResponse(frequencies, magnitude, phase);
      magnitude.forEach((value, index) => {
        totalDb[index] += 20 * Math.log10(Math.max(value, 0.000001));
      });
    });
    return totalDb;
  };
  const componentSettings = getEqFilterSettings();

  return {
    combined: calculateResponse(componentSettings),
    components: Object.fromEntries(componentSettings.map((settings) => [
      settings.name,
      calculateResponse([settings]),
    ])),
  };
}

function updateEqResponsePath(response, selector = ".eq-response") {
  const minDb = EQ_GRAPH_MIN_DB;
  const maxDb = EQ_GRAPH_MAX_DB;
  const left = 34;
  const top = 8;
  const width = 298;
  const height = 118;
  const path = [...response].map((db, index) => {
    const x = left + (index / (response.length - 1)) * width;
    const clampedDb = clamp(db, minDb, maxDb);
    const y = top + ((maxDb - clampedDb) / (maxDb - minDb)) * height;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
  elements.eqGraph.querySelector(selector).setAttribute("d", path);
}

function updateEqResponseFill(response) {
  const fill = elements.eqGraph.querySelector(".eq-response-fill");
  const linePath = elements.eqGraph.querySelector(".eq-response").getAttribute("d");
  fill.setAttribute("d", `${linePath} L332 126 L34 126 Z`);
}

function updateCombinedEqResponse(response) {
  updateEqResponsePath(response);
  updateEqResponseFill(response);
}

function updateEqComponentResponsePaths(responses) {
  EQ_COMPONENT_NAMES.forEach((name) => {
    const path = elements.eqGraph.querySelector(`[data-eq-component-response="${name}"]`);
    const response = responses[name];
    path.setAttribute("visibility", response ? "visible" : "hidden");
    if (response) {
      updateEqResponsePath(response, `[data-eq-component-response="${name}"]`);
    } else {
      path.removeAttribute("d");
    }
  });
}

function drawEqGraph(animateResponse = true) {
  ensureEqGraphStructure();
  updateFilterCutoffLines();
  updateEqHandles();
  const responses = calculateEqResponses();
  if (!responses) {
    return;
  }
  updateEqComponentResponsePaths(responses.components);
  const targetResponse = responses.combined;

  if (eqAnimationFrame !== null) {
    window.cancelAnimationFrame(eqAnimationFrame);
    eqAnimationFrame = null;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!displayedEqResponse || reduceMotion || !animateResponse) {
    displayedEqResponse = targetResponse;
    updateCombinedEqResponse(targetResponse);
    return;
  }

  const sourceResponse = Float32Array.from(displayedEqResponse);
  const startedAt = performance.now();
  const duration = 140;
  const animate = (timestamp) => {
    const progress = clamp((timestamp - startedAt) / duration, 0, 1);
    displayedEqResponse = Float32Array.from(targetResponse, (target, index) => (
      sourceResponse[index] + (target - sourceResponse[index]) * progress
    ));
    updateCombinedEqResponse(displayedEqResponse);
    if (progress < 1) {
      eqAnimationFrame = window.requestAnimationFrame(animate);
    } else {
      eqAnimationFrame = null;
    }
  };
  eqAnimationFrame = window.requestAnimationFrame(animate);
}

function syncDebugControls() {
  elements.debugPanel.querySelectorAll("[data-debug-setting]").forEach((input) => {
    const name = input.dataset.debugSetting;
    if (input.type === "checkbox") {
      input.checked = debugSettings[name] === true;
    } else {
      input.value = String(debugSettings[name]);
    }
  });

  elements.debugPanel.querySelectorAll("[data-debug-output]").forEach((output) => {
    const name = output.dataset.debugOutput;
    output.value = formatDebugValue(name, debugSettings[name]);
  });
  syncEqTypeControls();
  syncFilterControls();
  syncWaveformControls();
  syncContinuousSoundButtons();
  drawEqGraph();
}

function toggleDebugPanel(forceOpen) {
  const isOpen = forceOpen ?? elements.debugPanel.hidden;
  elements.debugPanel.hidden = !isOpen;
  document.body.classList.toggle("debug-open", isOpen);
  document.documentElement.classList.toggle("debug-open", isOpen);
  elements.settingsButton.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) {
    toggleResetCreditPanel(false);
    toggleDesignPicker(false);
    syncDebugControls();
  }
}

function openSettingsWindow() {
  if (SETTINGS_WINDOW) {
    return;
  }
  if (settingsWindowHandle && !settingsWindowHandle.closed) {
    settingsWindowHandle.focus();
    return;
  }

  const settingsUrl = new URL(location.href);
  settingsUrl.searchParams.set("settings", "1");
  settingsUrl.searchParams.delete("debug");
  settingsWindowHandle = window.open(
    settingsUrl.toString(),
    "ai-usage-meter-settings",
    "popup=yes,width=420,height=720,resizable=yes,scrollbars=yes",
  );
  if (!settingsWindowHandle) {
    toggleDebugPanel(true);
  } else {
    elements.settingsButton.setAttribute("aria-expanded", "true");
  }
}

function closeSettingsWindow() {
  if (SETTINGS_WINDOW && window.opener && !window.opener.closed) {
    window.close();
    return;
  }
  toggleDebugPanel(false);
}

function startRecoveryFromZero() {
  stopRecoveryAnimation();
  setUsage({ total: state.total, remaining: 0 });
  startRecoveryWithRecording({ demo: true });
}

function previewRecoverySound() {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    context.resume().catch((error) => {
      console.warn("試聴音を有効にできませんでした。", error);
    });
  }
  playRecoverySound();
}

window.kickAiUsage = function kickAiUsage(options = {}) {
  stopRecoveryAnimation();

  if (options.design) {
    state.design = normalizeDesign(options.design);
  }

  if (Number.isFinite(options.remaining) || Number.isFinite(options.total)) {
    setUsage({
      total: options.total ?? state.total,
      remaining: options.remaining ?? state.remaining,
      design: state.design,
    });
    return;
  }

  consumeUsage(options.cost ?? 1);
};

window.setAiUsage = function setAiUsage(options = {}) {
  stopRecoveryAnimation();

  setUsage({
    total: options.total ?? state.total,
    remaining: options.remaining ?? state.remaining,
    design: options.design ?? state.design,
  });
};

window.resetAiUsage = function resetAiUsage(total = state.total) {
  stopRecoveryAnimation();

  const nextTotal = toPositiveInteger(total, DEFAULT_TOTAL);
  setUsage({
    total: nextTotal,
    remaining: nextTotal,
  });
};

window.setAiUsageDesign = function setAiUsageDesign(design) {
  state.design = normalizeDesign(design);
  saveState();
  render();
};

function toggleDesignPicker(forceOpen) {
  const isOpen = forceOpen ?? elements.designPicker.hidden;
  elements.designPicker.hidden = !isOpen;
  elements.energyFrame.setAttribute("aria-expanded", String(isOpen));
}

elements.energyFrame.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleDesignPicker();
});

elements.settingsButton.addEventListener("click", (event) => {
  event.stopPropagation();
  openSettingsWindow();
});

elements.energyCanArea.addEventListener("mouseenter", () => {
  if (SETTINGS_WINDOW) {
    return;
  }
  toggleDesignPicker(false);
  toggleResetCreditPanel(true);
});

elements.energyCanArea.addEventListener("mouseleave", () => {
  if (SETTINGS_WINDOW) {
    return;
  }
  toggleResetCreditPanel(false);
});

elements.resetCounter.addEventListener("click", (event) => {
  event.stopPropagation();
  if (event.detail === 0) {
    toggleDesignPicker(false);
    toggleResetCreditPanel();
  }
});

elements.energyCanButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleDesignPicker(false);
  if (event.shiftKey) {
    useActualResetCredit();
  } else {
    startRecoveryWithRecording({ demo: true });
  }
});

elements.designPicker.addEventListener("click", (event) => {
  const button = event.target.closest(".design-option");
  if (!button) {
    return;
  }

  state.design = normalizeDesign(button.dataset.design);
  saveState();
  render();
  toggleDesignPicker(false);
});

elements.continuousStartButton.addEventListener("click", startContinuousSound);
elements.continuousStopButton.addEventListener("click", stopContinuousSound);

elements.debugPanel.addEventListener("input", (event) => {
  const input = event.target.closest("[data-debug-setting]");
  if (!input) {
    return;
  }

  const name = input.dataset.debugSetting;
  const value = input.type === "checkbox" ? input.checked : input.value;
  debugSettings[name] = normalizeDebugSetting(name, value);
  saveDebugSettings();
  const output = elements.debugPanel.querySelector(`[data-debug-output="${name}"]`);
  if (output) {
    output.value = formatDebugValue(name, debugSettings[name]);
  }
  if (name.startsWith("eq") || name.startsWith("highpass") || name.startsWith("lowpass")) {
    drawEqGraph();
  }
  if (name === "bgmEnabled" && !debugSettings.bgmEnabled) {
    stopBassBgm();
  }
  if (name === "recordingEnabled") {
    setRecordingStatus(
      debugSettings.recordingEnabled
        ? "次の回復を、完了1秒後までMP4で保存します。"
        : "録画はOFFです。",
      "idle",
    );
  }
});

elements.debugPanel.addEventListener("click", (event) => {
  const waveformButton = event.target.closest("[data-waveform-value]");
  if (waveformButton) {
    debugSettings.waveform = normalizeDebugSetting("waveform", waveformButton.dataset.waveformValue);
    saveDebugSettings();
    syncWaveformControls();
    return;
  }

  const filterButton = event.target.closest("[data-filter-enabled-setting]");
  if (filterButton) {
    const name = filterButton.dataset.filterEnabledSetting;
    debugSettings[name] = normalizeDebugSetting(name, filterButton.dataset.filterEnabledValue);
    saveDebugSettings();
    syncFilterControls();
    drawEqGraph();
    return;
  }

  const typeButton = event.target.closest("[data-eq-type-setting]");
  if (typeButton) {
    const name = typeButton.dataset.eqTypeSetting;
    debugSettings[name] = normalizeDebugSetting(name, typeButton.dataset.eqTypeValue);
    saveDebugSettings();
    syncEqTypeControls();
    drawEqGraph();
    return;
  }

  const button = event.target.closest("[data-debug-action]");
  if (!button) {
    return;
  }

  const actions = {
    close: closeSettingsWindow,
    "zero-recovery": startRecoveryFromZero,
    preview: previewRecoverySound,
  };
  actions[button.dataset.debugAction]?.();
});

elements.eqGraph.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest("[data-eq-handle]");
  if (!handle) {
    return;
  }

  event.preventDefault();
  draggedEqHandle = handle.dataset.eqHandle;
  handle.classList.add("is-dragging");
  handle.setPointerCapture?.(event.pointerId);
  updateEqHandleFromPointer(event);
});

elements.eqGraph.addEventListener("pointermove", (event) => {
  if (!draggedEqHandle) {
    return;
  }
  event.preventDefault();
  updateEqHandleFromPointer(event);
});

function finishEqHandleDrag(event) {
  if (!draggedEqHandle) {
    return;
  }
  const handle = elements.eqGraph.querySelector(`[data-eq-handle="${draggedEqHandle}"]`);
  handle?.classList.remove("is-dragging");
  handle?.releasePointerCapture?.(event.pointerId);
  draggedEqHandle = null;
}

elements.eqGraph.addEventListener("pointerup", finishEqHandleDrag);
elements.eqGraph.addEventListener("pointercancel", finishEqHandleDrag);

elements.eqGraph.addEventListener("keydown", (event) => {
  const handle = event.target.closest("[data-eq-handle]");
  if (!handle || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    return;
  }

  event.preventDefault();
  const settings = EQ_HANDLE_SETTINGS[handle.dataset.eqHandle];
  const frequencyRatio = 2 ** (1 / 12);
  let frequency = debugSettings[settings.frequency];
  let gain = debugSettings[settings.gain];
  if (event.key === "ArrowLeft") {
    frequency = Math.round((frequency / frequencyRatio) / 10) * 10;
  } else if (event.key === "ArrowRight") {
    frequency = Math.round((frequency * frequencyRatio) / 10) * 10;
  } else if (event.key === "ArrowUp") {
    gain += 0.5;
  } else if (event.key === "ArrowDown") {
    gain -= 0.5;
  }
  setEqHandleValues(handle.dataset.eqHandle, frequency, gain);
});

document.addEventListener("click", () => {
  toggleDesignPicker(false);
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === ",") {
    event.preventDefault();
    openSettingsWindow();
    return;
  }

  if (event.key === "Escape") {
    toggleDesignPicker(false);
    toggleResetCreditPanel(false);
    toggleDebugPanel(false);
  }
});

window.addEventListener("storage", (event) => {
  if (event.storageArea !== localStorage) {
    return;
  }
  if (event.key === RECORDING_STATUS_STORAGE_KEY) {
    syncRecordingStatus(event.newValue);
    return;
  }
  if (event.key !== DEBUG_STORAGE_KEY) {
    return;
  }

  syncSettingsFromStorage(event.newValue, debugSettings, DEFAULT_DEBUG_SETTINGS);
  if (!debugSettings.bgmEnabled) {
    stopBassBgm();
  }
  if (!elements.debugPanel.hidden) {
    syncDebugControls();
  }
});

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.data?.type !== "ai-usage-meter-settings-closed") {
    return;
  }
  settingsWindowHandle = null;
  elements.settingsButton.setAttribute("aria-expanded", "false");
});

if (SETTINGS_WINDOW) {
  window.addEventListener("beforeunload", () => {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: "ai-usage-meter-settings-closed" }, location.origin);
    }
  });
}

document.documentElement.classList.toggle("standalone-window", STANDALONE_WINDOW);
document.documentElement.classList.toggle("settings-window", SETTINGS_WINDOW);
document.body.classList.toggle("settings-window", SETTINGS_WINDOW);
if (SETTINGS_WINDOW) {
  document.title = "AI Usage Meter Settings";
}
buildCells();
buildDesignPicker();
renderPixelText(elements.demoLabel, "DEMO");
render();
resizeStandaloneWindow();
syncRecordingStatus(localStorage.getItem(RECORDING_STATUS_STORAGE_KEY));
initializeDebugSections();
toggleDebugPanel(SETTINGS_WINDOW);
if (!SETTINGS_WINDOW) {
  startUsageSync();
}

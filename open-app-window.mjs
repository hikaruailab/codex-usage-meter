import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const url = process.argv[2];
const windowSize = process.env.USAGE_METER_WINDOW_SIZE ?? "360,482";

function withStandaloneMode(value) {
  try {
    const parsed = new URL(value);
    parsed.searchParams.set("standalone", "1");
    return parsed.toString();
  } catch {
    return value;
  }
}

const appUrl = withStandaloneMode(url);

if (!url) {
  console.error("起動するURLが指定されていません。");
  process.exit(1);
}

function launch(command, args) {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function findMacBrowser() {
  return [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].find((candidate) => existsSync(candidate));
}

function findWindowsBrowser() {
  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LOCALAPPDATA,
  ].filter(Boolean);
  const relativePaths = [
    "Google/Chrome/Application/chrome.exe",
    "Microsoft/Edge/Application/msedge.exe",
    "BraveSoftware/Brave-Browser/Application/brave.exe",
  ];

  return roots
    .flatMap((root) => relativePaths.map((relativePath) => `${root}\\${relativePath}`))
    .find((candidate) => existsSync(candidate));
}

function findLinuxBrowser() {
  for (const command of ["google-chrome", "microsoft-edge", "brave-browser", "chromium", "chromium-browser"]) {
    if (spawnSync("which", [command], { stdio: "ignore" }).status === 0) {
      return command;
    }
  }
  return null;
}

function getProfileDirectory() {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Codex Usage Meter", "BrowserProfile");
  }
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA ?? homedir(), "Codex Usage Meter", "BrowserProfile");
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "codex-usage-meter", "BrowserProfile");
}

const appArguments = [
  `--app=${appUrl}`,
  `--window-size=${windowSize}`,
  "--new-window",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-sync",
  `--user-data-dir=${getProfileDirectory()}`,
];

if (process.platform === "darwin") {
  const browser = findMacBrowser();
  if (browser) {
    launch(browser, appArguments);
  } else {
    launch("open", [url]);
  }
} else if (process.platform === "win32") {
  const browser = findWindowsBrowser();
  if (browser) {
    launch(browser, appArguments);
  } else {
    launch("cmd.exe", ["/c", "start", "", `\"${url}\"`]);
  }
} else {
  const browser = findLinuxBrowser();
  if (browser) {
    launch(browser, appArguments);
  } else {
    launch("xdg-open", [url]);
  }
}

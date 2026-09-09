"use strict";
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  desktopCapturer,
  session,
  protocol,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const { validate } = require("./core.js");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
    },
  },
]);
let win,
  selected,
  job = null;
const media = new Map();
const jobs = new Set();
const recovery = () => path.join(app.getPath("userData"), "recovery.json");
function executable() {
  const candidates = [
    process.env.DEMOCRAFT_FFMPEG,
    path.join(process.resourcesPath || "", "vendor", "ffmpeg.exe"),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || "ffmpeg";
}
function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(executable(), args, { windowsHide: true });
    let out = "";
    p.stderr.on("data", (b) => (out = (out + b).slice(-12000)));
    p.on("error", reject);
    p.on("close", (c) =>
      c === 0
        ? resolve(out)
        : reject(Error(out.slice(-2000) || "视频编码失败")),
    );
  });
}
function addMedia(file) {
  if (!fs.existsSync(file)) throw Error("素材不存在，请重新导入");
  const token = crypto.randomUUID();
  media.set(token, file);
  return {
    path: file,
    url: `media://asset/${token}`,
    name: path.basename(file),
  };
}
function replaceFile(tmp, file) {
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    if (!["EXDEV", "EPERM", "EEXIST"].includes(e.code)) throw e;
    fs.copyFileSync(tmp, file);
    fs.rmSync(tmp, { force: true });
  }
}
function atomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, data);
  replaceFile(tmp, file);
}
function checkSource(file) {
  if (typeof file !== "string" || ![...media.values()].includes(file))
    throw Error("素材未授权");
}
async function cancel() {
  if (!job) return;
  const j = job;
  job = null;
  j.cancelled = true;
  if (j.proc && !j.proc.killed) j.proc.kill();
  await j.closed.catch(() => {});
  fs.rmSync(j.temp, { force: true });
  jobs.delete(j.temp);
}
app.whenReady().then(() => {
  protocol.handle("media", (req) => {
    const token = new URL(req.url).pathname.slice(1);
    const file = media.get(token);
    if (!file) return new Response("Not found", { status: 404 });
    const size = fs.statSync(file).size;
    const range = req.headers.get("range");
    let start = 0,
      end = size - 1,
      status = 200;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      if (match[1]) {
        start = Number(match[1]);
        if (match[2]) end = Math.min(Number(match[2]), end);
      } else if (match[2]) start = Math.max(0, size - Number(match[2]));
      if (start > end || start >= size)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      status = 206;
    }
    const headers = {
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
      "Content-Type":
        path.extname(file).toLowerCase() === ".webm"
          ? "video/webm"
          : "video/mp4",
    };
    if (status === 206)
      headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    return new Response(
      req.method === "HEAD"
        ? null
        : require("node:stream").Readable.toWeb(
            fs.createReadStream(file, { start, end }),
          ),
      { status, headers },
    );
  });
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) =>
    cb(
      wc === win?.webContents &&
        ["media", "display-capture"].includes(permission),
    ),
  );
  session.defaultSession.setDisplayMediaRequestHandler(async (req, cb) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
      });
      const source = sources.find((s) => s.id === selected?.id);
      if (!source) return cb({});
      cb(
        selected.audio
          ? { video: source, audio: "loopback" }
          : { video: source },
      );
    } catch {
      cb({});
    }
  });
  win = new BrowserWindow({
    width: 1510,
    height: 970,
    minWidth: 1100,
    minHeight: 740,
    backgroundColor: "#111114",
    title: "DemoCraft · 演示工坊",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, "index.html"));
  win.on("close", (e) => {
    if (job) {
      e.preventDefault();
      win.webContents.send("before-close");
    }
  });
});
app.on("window-all-closed", () => app.quit());
function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    if (event.sender !== win?.webContents) throw Error("Unauthorized");
    try {
      return await fn(...args);
    } catch (e) {
      throw Error(e.message);
    }
  });
}
handle("environment", async () => {
  let ffmpeg = false;
  try {
    await run(["-version"]);
    ffmpeg = true;
  } catch {}
  return { ffmpeg, version: app.getVersion(), platform: process.platform };
});
handle("import", async () => {
  const r = await dialog.showOpenDialog(win, {
    filters: [{ name: "视频", extensions: ["mp4", "webm", "mov", "mkv"] }],
    properties: ["openFile"],
  });
  return r.canceled ? null : addMedia(r.filePaths[0]);
});
handle("sources", async () => {
  const items = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 300, height: 180 },
    fetchWindowIcons: false,
  });
  return items
    .filter((s) => !s.name.includes("DemoCraft"))
    .map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
    }));
});
handle("select-source", async (s) => {
  selected = { id: String(s.id), audio: !!s.audio };
  return true;
});
handle("record-save", async (buffer) => {
  if (!(buffer instanceof Uint8Array) && !(buffer instanceof ArrayBuffer))
    throw Error("无效录制");
  const dir = path.join(app.getPath("videos"), "DemoCraft");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `recording-${Date.now()}.webm`);
  fs.writeFileSync(file, Buffer.from(buffer));
  return addMedia(file);
});
handle("project-save", async (input) => {
  const p = validate(input);
  if (p.source) checkSource(p.source.path);
  const r = await dialog.showSaveDialog(win, {
    defaultPath: "我的演示.democraft",
    filters: [{ name: "DemoCraft 工程", extensions: ["democraft"] }],
  });
  if (r.canceled) return null;
  atomic(r.filePath, JSON.stringify(p, null, 2));
  return r.filePath;
});
handle("project-open", async () => {
  const r = await dialog.showOpenDialog(win, {
    filters: [{ name: "DemoCraft 工程", extensions: ["democraft"] }],
    properties: ["openFile"],
  });
  if (r.canceled) return null;
  const p = validate(JSON.parse(fs.readFileSync(r.filePaths[0], "utf8")));
  if (p.source) {
    try {
      p.source = addMedia(p.source.path);
    } catch {
      const replacement = await dialog.showOpenDialog(win, {
        title: "素材已移动，请选择原视频",
        filters: [{ name: "视频", extensions: ["mp4", "webm", "mov", "mkv"] }],
        properties: ["openFile"],
      });
      if (replacement.canceled) throw Error("没有重新定位素材，工程未打开");
      p.source = addMedia(replacement.filePaths[0]);
    }
  }
  return p;
});
handle("autosave", async (p) => {
  p = validate(p);
  if (p.source) checkSource(p.source.path);
  atomic(recovery(), JSON.stringify(p));
  return true;
});
handle("recover", async () => {
  try {
    const p = validate(JSON.parse(fs.readFileSync(recovery(), "utf8")));
    if (p.source) p.source = addMedia(p.source.path);
    return p;
  } catch {
    return null;
  }
});
handle("export-start", async (options) => {
  if (job) throw Error("已有导出正在运行");
  checkSource(options.source);
  const allowed = ["1920x1080", "1080x1920", "1080x1080"];
  if (!allowed.includes(`${options.width}x${options.height}`))
    throw Error("无效分辨率");
  if (!(options.duration > 0 && options.duration <= 300 && options.start >= 0))
    throw Error("首版支持最长 5 分钟成片");
  const r = await dialog.showSaveDialog(win, {
    defaultPath: "DemoCraft-export.mp4",
    filters: [{ name: "MP4 视频", extensions: ["mp4"] }],
  });
  if (r.canceled) return null;
  const temp = path.join(
    path.dirname(r.filePath),
    `.democraft-${crypto.randomUUID()}.mp4`,
  );
  jobs.add(temp);
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "image2pipe",
    "-framerate",
    "30",
    "-i",
    "pipe:0",
    "-ss",
    String(options.start),
    "-t",
    String(options.duration),
    "-i",
    options.source,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-af",
    "apad",
    "-t",
    String(options.duration),
    "-movflags",
    "+faststart",
    temp,
  ];
  const proc = spawn(executable(), args, { windowsHide: true });
  let err = "";
  let resolveClose;
  const closed = new Promise((r) => (resolveClose = r));
  const j = {
    proc,
    temp,
    output: r.filePath,
    closed,
    code: null,
    error: null,
    frames: 0,
    options,
  };
  job = j;
  proc.stderr.on("data", (b) => (err = (err + b).slice(-4000)));
  proc.on("error", (e) => {
    j.error = e.message;
    resolveClose(-1);
  });
  proc.on("close", (code) => {
    j.code = code;
    if (code !== 0) j.error = err || j.error || "编码器退出";
    resolveClose(code);
  });
  proc.stdin.on("error", () => {});
  return { frames: Math.ceil(options.duration * 30), fps: 30 };
});
handle("export-frame", async (bytes) => {
  const j = job;
  if (!j || j.error || j.code !== null) throw Error(j?.error || "导出已停止");
  const b = Buffer.from(bytes);
  if (
    b.length > 20 * 1024 * 1024 ||
    b.length < 8 ||
    b.readUInt32BE(0) !== 0x89504e47
  )
    throw Error("无效视频帧");
  await new Promise((resolve, reject) =>
    j.proc.stdin.write(b, (e) => (e ? reject(e) : resolve())),
  );
  j.frames++;
  return true;
});
handle("export-finish", async () => {
  const j = job;
  if (!j) throw Error("没有导出任务");
  j.proc.stdin.end();
  await j.closed;
  if (j.error) throw Error(j.error);
  if (j.cancelled) throw Error("导出已取消");
  if (j.frames !== Math.ceil(j.options.duration * 30))
    throw Error("帧数不完整");
  replaceFile(j.temp, j.output);
  jobs.delete(j.temp);
  job = null;
  return j.output;
});
handle("export-cancel", cancel);

handle("demo", async () =>
  addMedia(
    app.isPackaged
      ? path.join(process.resourcesPath, "demo/orbit-demo.webm")
      : path.join(__dirname, "../assets/orbit-demo.webm"),
  ),
);

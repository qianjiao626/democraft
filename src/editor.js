"use strict";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)],
  C = DemoCore;
const video = $("#video"),
  canvas = $("#preview");
let project = C.defaults(),
  history = [],
  future = [],
  busy = false,
  aborted = false,
  recording = null,
  saveTimer,
  loadToken = 0;
const clone = (p) => JSON.parse(JSON.stringify(p));
function status(text) {
  $("#status").textContent = text;
}
function report(e) {
  console.error(e);
  status("操作失败：" + e.message);
}
function guard(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      report(e);
    }
  };
}
function valueAt(key) {
  return key.split(".").reduce((a, k) => a[k], project);
}
function assign(key, v) {
  const keys = key.split(".");
  if (keys.length === 2) project[keys[0]][keys[1]] = v;
  else project[key] = v;
}
function remember() {
  history.push(clone(project));
  if (history.length > 60) history.shift();
  future = [];
}
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () =>
      studio
        .autosave(project)
        .then(() =>
          status("已自动保存到本机 · " + new Date().toLocaleTimeString()),
        )
        .catch(report),
    800,
  );
}
function sync() {
  for (const el of $$("[data-bind]")) {
    const v = valueAt(el.dataset.bind);
    if (el.type === "checkbox") el.checked = !!v;
    else el.value = v;
  }
  $$("[data-palette]").forEach((el) =>
    el.classList.toggle("active", el.dataset.palette === project.palette),
  );
  const [w, h] = C.dimensions(project.ratio);
  canvas.width = w;
  canvas.height = h;
  $("#resolution").textContent = `${w} × ${h} · 30 FPS`;
  $("#asset-name").textContent = project.source?.name || "等待你的第一个镜头";
  $("#asset-meta").textContent = project.source
    ? `${video.videoWidth} × ${video.videoHeight} · ${C.formatTime(video.duration)}\n源文件保留，不破坏原片`
    : "MP4 · WebM · MOV · MKV";
  $("#clip").textContent = project.source?.name || "导入后显示视频片段";
  $("#camera-label").textContent = project.zoom.enabled
    ? `聚焦 ${project.zoom.start.toFixed(1)} → ${project.zoom.end.toFixed(1)} 秒 · ${project.zoom.scale.toFixed(2)}×`
    : "开启聚焦，平滑放大重要细节";
  $("#duration").textContent = C.duration(project).toFixed(1) + " 秒成片";
  $("#seek").max = Number.isFinite(video.duration) ? video.duration : 1;
  $("#empty-hint").hidden = !!project.source;
  $("#undo").disabled = history.length === 0 || busy;
  $("#redo").disabled = future.length === 0 || busy;
  draw();
}
function draw() {
  renderFrame(canvas, video, project, video.currentTime || 0);
  $("#time").textContent =
    `${C.formatTime(video.currentTime)} / ${C.formatTime(video.duration)}`;
  $("#seek").value = video.currentTime || 0;
  $("#play").textContent = video.paused ? "▶" : "Ⅱ";
}
function change(key, v) {
  if (busy || valueAt(key) === v) return;
  remember();
  assign(key, v);
  project = C.validate(project);
  if (Number.isFinite(video.duration)) {
    project.trimEnd = Math.min(project.trimEnd, video.duration);
    project.trimStart = Math.min(
      project.trimStart,
      Math.max(0, project.trimEnd - 0.033),
    );
  }
  sync();
  autosave();
}
$$("[data-bind]").forEach((el) =>
  el.addEventListener("change", () =>
    change(
      el.dataset.bind,
      el.type === "checkbox"
        ? el.checked
        : ["range", "number"].includes(el.type)
          ? Number(el.value)
          : el.value,
    ),
  ),
);
$$("[data-palette]").forEach(
  (el) => (el.onclick = () => change("palette", el.dataset.palette)),
);
function seekTo(t) {
  return new Promise((resolve, reject) => {
    t = Math.max(0, Math.min(t, Math.max(0, video.duration - 0.001)));
    if (Math.abs(video.currentTime - t) < 0.0001 && video.readyState >= 2) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(Error("视频定位超时，请检查素材编码"));
    }, 15000);
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
    };
    const done = () => {
        cleanup();
        if (Math.abs(video.currentTime - t) > 0.08)
          reject(Error("素材不支持精确定位，请先转换为标准 MP4"));
        else resolve();
      },
      fail = () => {
        cleanup();
        reject(Error("无法读取视频"));
      };
    video.addEventListener("seeked", done);
    video.addEventListener("error", fail);
    video.currentTime = t;
  });
}
async function load(p, reset = false) {
  const previous = clone(project);
  try {
    await loadMedia(p, reset);
  } catch (e) {
    try {
      await loadMedia(previous, false);
    } catch {
      project = C.defaults();
      video.removeAttribute("src");
      video.load();
      sync();
    }
    throw e;
  }
}
async function loadMedia(p, reset = false) {
  const token = ++loadToken;
  video.pause();
  if (!p.source) {
    project = p;
    video.removeAttribute("src");
    video.load();
    sync();
    return;
  }
  status("正在读取素材…");
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(Error("素材载入超时"));
    }, 20000);
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("error", fail);
    };
    const ready = () => {
        cleanup();
        resolve();
      },
      fail = () => {
        cleanup();
        reject(
          Error("浏览器无法解码此素材，请转换为 H.264 MP4 或 VP8/VP9 WebM"),
        );
      };
    video.addEventListener("loadeddata", ready);
    video.addEventListener("error", fail);
    video.src = p.source.url;
    video.load();
  });
  // MediaRecorder WebM may omit duration. Chromium discovers it after seeking beyond EOF.
  if (!Number.isFinite(video.duration)) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(Error("无法读取视频时长，请先用 FFmpeg 转换为 MP4"));
      }, 15000);
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener("durationchange", check);
      };
      const check = () => {
        if (Number.isFinite(video.duration)) {
          cleanup();
          resolve();
        }
      };
      video.addEventListener("durationchange", check);
      video.currentTime = 1e9;
      check();
    });
  }
  if (token !== loadToken) return;
  project = C.validate(p);
  if (reset) {
    project.trimStart = 0;
    project.trimEnd = Math.min(video.duration, 300);
    project.zoom.start = Number(Math.min(1, video.duration * 0.2).toFixed(2));
    project.zoom.end = Number(Math.min(4, video.duration * 0.8).toFixed(2));
    history = [];
    future = [];
  } else {
    project.trimEnd = Math.min(project.trimEnd, video.duration);
    project.trimStart = Math.min(
      project.trimStart,
      Math.max(0, project.trimEnd - 0.033),
    );
  }
  await seekTo(project.trimStart);
  sync();
  autosave();
  status(
    video.duration > 300
      ? "已载入 · 首版成片最长 5 分钟，请调整裁剪范围"
      : "素材已就绪 · 开始设计你的演示",
  );
}
$("#import").onclick = guard(async () => {
  if (busy || recording) return;
  const s = await studio.importVideo();
  if (s) await load({ ...C.defaults(), source: s }, true);
});
$("#open").onclick = guard(async () => {
  if (busy || recording) return;
  const p = await studio.openProject();
  if (p) {
    history = [];
    future = [];
    await load(p);
  }
});
$("#save").onclick = guard(async () => {
  if (busy) return;
  clearTimeout(saveTimer);
  const path = await studio.saveProject(project);
  if (path) status("工程已保存：" + path);
});
$("#recover").onclick = guard(async () => {
  if (busy || recording) return;
  const p = await studio.recover();
  if (p) {
    history = [];
    future = [];
    await load(p);
  } else status("没有可恢复的工程，或原素材已移动");
});
async function restore(from, to) {
  if (busy || !from.length) return;
  to.push(clone(project));
  const p = from.pop();
  if (p.source?.url !== project.source?.url) await load(p);
  else {
    project = p;
    sync();
    autosave();
  }
}
$("#undo").onclick = guard(() => restore(history, future));
$("#redo").onclick = guard(() => restore(future, history));
$("#play").onclick = guard(async () => {
  if (!project.source || busy) return;
  if (!video.paused) video.pause();
  else {
    if (
      video.currentTime >= project.trimEnd ||
      video.currentTime < project.trimStart
    )
      await seekTo(project.trimStart);
    await video.play();
  }
  draw();
});
$("#seek").oninput = () => {
  if (!busy && project.source) {
    video.pause();
    video.currentTime = Number($("#seek").value);
  }
};
$("#in").onclick = () => {
  if (project.source)
    change("trimStart", Math.min(video.currentTime, project.trimEnd - 0.033));
};
$("#out").onclick = () => {
  if (project.source)
    change("trimEnd", Math.max(video.currentTime, project.trimStart + 0.033));
};
video.addEventListener("seeked", draw);
video.addEventListener("pause", draw);
video.addEventListener("play", draw);
function tick() {
  if (!busy && !video.paused) {
    if (video.currentTime >= project.trimEnd) {
      video.pause();
      video.currentTime = project.trimEnd;
    }
    draw();
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
function setBusy(value) {
  busy = value;
  $$("main button, main input, main select, header button").forEach(
    (e) => (e.disabled = value),
  );
  sync();
}
$("#export").onclick = guard(async () => {
  if (busy || recording) return;
  if (!project.source) throw Error("请先导入或录制视频");
  const duration = C.duration(project);
  if (!(duration > 0 && duration <= 300))
    throw Error("请选择大于 0 秒、不超过 5 分钟的裁剪范围");
  const env = await studio.environment();
  if (!env.ffmpeg)
    throw Error(
      "未找到 FFmpeg。请安装后重启应用，或设置 DEMOCRAFT_FFMPEG 环境变量",
    );
  video.pause();
  const previous = video.currentTime;
  const [width, height] = C.dimensions(project.ratio);
  setBusy(true);
  aborted = false;
  let started = false;
  const dialog = $("#export-dialog");
  try {
    const result = await studio.exportStart({
      source: project.source.path,
      width,
      height,
      start: project.trimStart,
      duration,
    });
    if (!result) return;
    started = true;
    dialog.showModal();
    $("#export-heading").textContent = "正在制作你的演示";
    $("#cancel-export").textContent = "取消导出";
    $("#export-progress").value = 0;
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const start = performance.now();
    for (let i = 0; i < result.frames; i++) {
      if (aborted) throw Error("导出已取消");
      await seekTo(project.trimStart + i / result.fps);
      renderFrame(out, video, project, project.trimStart + i / result.fps);
      const blob = await new Promise((resolve, reject) =>
        out.toBlob(
          (b) => (b ? resolve(b) : reject(Error("无法生成画面"))),
          "image/png",
        ),
      );
      if (aborted) throw Error("导出已取消");
      await studio.exportFrame(new Uint8Array(await blob.arrayBuffer()));
      const percent = ((i + 1) / result.frames) * 100;
      $("#export-progress").value = percent;
      $("#export-detail").textContent =
        `${percent.toFixed(0)}% · ${i + 1} / ${result.frames} 帧 · 已用 ${Math.round((performance.now() - start) / 1000)} 秒`;
    }
    if (aborted) throw Error("导出已取消");
    $("#export-heading").textContent = "正在封装 MP4…";
    const output = await studio.exportFinish();
    started = false;
    $("#export-heading").textContent = "你的作品，已准备好。";
    $("#export-detail").textContent = output;
    $("#cancel-export").textContent = "完成";
    status("MP4 导出成功：" + output);
  } catch (e) {
    if (started) await studio.exportCancel();
    if (dialog.open) dialog.close();
    throw e;
  } finally {
    setBusy(false);
    await seekTo(previous);
    draw();
  }
});
$("#cancel-export").onclick = () => {
  if (!busy) {
    $("#export-dialog").close();
    return;
  }
  aborted = true;
  $("#export-detail").textContent = "正在安全取消…";
  studio.exportCancel().catch(report);
};
$("#export-dialog").addEventListener("cancel", (e) => {
  if (busy) {
    e.preventDefault();
    $("#cancel-export").click();
  }
});
$("#record").onclick = guard(async () => {
  if (busy) return;
  if (recording) {
    recording.stop();
    return;
  }
  $("#record-dialog").showModal();
  $("#sources").textContent = "正在获取可录制窗口…";
  const sources = await studio.sources();
  $("#sources").replaceChildren();
  for (const source of sources) {
    const button = document.createElement("button"),
      img = document.createElement("img"),
      text = document.createElement("span");
    img.src = source.thumbnail;
    text.textContent = source.name;
    button.append(img, text);
    button.onclick = guard(() => startRecording(source));
    $("#sources").append(button);
  }
  if (!sources.length) $("#sources").textContent = "没有可用的屏幕或窗口。";
});
$("#close-record").onclick = () => $("#record-dialog").close();
async function startRecording(source) {
  if (recording || busy) return;
  $("#record-dialog").close();
  let screen, mic, audioContext, mixed, rec, timer;
  const chunks = [];
  let bytes = 0;
  const cleanup = () => {
    clearInterval(timer);
    screen?.getTracks().forEach((t) => t.stop());
    mic?.getTracks().forEach((t) => t.stop());
    mixed?.getTracks().forEach((t) => t.stop());
    audioContext?.close();
    recording = null;
    $("#record").classList.remove("recording");
    $("#record").textContent = "● 录制屏幕 / 窗口";
    ["import", "open", "recover", "export"].forEach(
      (id) => ($("#" + id).disabled = false),
    );
  };
  try {
    await studio.selectSource({
      id: source.id,
      audio: $("#system-audio").checked,
    });
    screen = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: $("#system-audio").checked,
    });
    if ($("#mic").checked)
      mic = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    const tracks = [...screen.getVideoTracks()];
    const audioStreams = [screen, mic].filter(
      (s) => s && s.getAudioTracks().length,
    );
    if (audioStreams.length) {
      audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      for (const s of audioStreams)
        audioContext.createMediaStreamSource(s).connect(destination);
      tracks.push(...destination.stream.getAudioTracks());
    }
    mixed = new MediaStream(tracks);
    const type = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((t) => MediaRecorder.isTypeSupported(t));
    rec = new MediaRecorder(mixed, {
      mimeType: type,
      videoBitsPerSecond: 6000000,
    });
    rec.ondataavailable = (e) => {
      if (e.data.size) {
        chunks.push(e.data);
        bytes += e.data.size;
        if (bytes > 350 * 1024 * 1024 && rec.state === "recording") {
          status("已达到 350MB 内存保护阈值，正在停止");
          rec.stop();
        }
      }
    };
    rec.onerror = (e) => {
      report(Error(e.error?.message || "录屏错误"));
      cleanup();
    };
    rec.onstop = guard(async () => {
      cleanup();
      setBusy(true);
      status("正在保存录屏…");
      try {
        const source = await studio.saveRecording(
          new Uint8Array(await new Blob(chunks, { type }).arrayBuffer()),
        );
        await load({ ...C.defaults(), source }, true);
      } finally {
        setBusy(false);
      }
    });
    screen.getVideoTracks()[0].onended = () => {
      if (rec.state === "recording") rec.stop();
    };
    recording = rec;
    rec.start(1000);
    const start = Date.now();
    $("#record").classList.add("recording");
    ["import", "open", "recover", "export"].forEach(
      (id) => ($("#" + id).disabled = true),
    );
    timer = setInterval(() => {
      const sec = (Date.now() - start) / 1000;
      $("#record").textContent = `■ 停止录制 · ${C.formatTime(sec)}`;
      if (sec >= 300 && rec.state === "recording") rec.stop();
    }, 250);
    status("正在录制 · 使用左侧按钮停止（最长 5 分钟）");
  } catch (e) {
    cleanup();
    throw e;
  }
}
document.addEventListener("keydown", (e) => {
  if (
    ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
    $("dialog[open]")
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    $("#play").click();
  }
  if (e.ctrlKey && e.key.toLowerCase() === "s") {
    e.preventDefault();
    $("#save").click();
  }
  if (e.ctrlKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    $(e.shiftKey ? "#redo" : "#undo").click();
  }
});
window.addEventListener("beforeunload", (e) => {
  if (recording || busy) {
    e.preventDefault();
    e.returnValue = "";
    status("请先停止录屏或取消导出，再关闭应用");
    return;
  }
  clearTimeout(saveTimer);
  studio.autosave(project).catch(() => {});
});
studio
  .environment()
  .then((env) => {
    $("#environment").textContent = env.ffmpeg
      ? "FFmpeg 已就绪 · v" + env.version
      : "导出需安装 FFmpeg 并加入 PATH";
  })
  .catch(report);
sync();

$("#demo").onclick = guard(async () => {
  if (busy || recording) return;
  await load(
    {
      ...C.defaults(),
      source: await studio.demo(),
      palette: "ember",
      title: "让你的产品，成为焦点。",
      caption: "一次录屏，就能做出清晰、精致的产品演示",
    },
    true,
  );
});
studio.onClose(() => status("请先取消导出，再关闭应用"));

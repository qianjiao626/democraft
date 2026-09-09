(function (root, factory) {
  if (typeof module === "object") module.exports = factory();
  else root.DemoCore = factory();
})(globalThis, () => {
  "use strict";
  const palettes = {
    aurora: ["#b6c5f8", "#7f92d4", "#e4b5d5"],
    ember: ["#f2b585", "#b46864", "#613f6d"],
    mint: ["#c6e5da", "#73afa7", "#607b9d"],
    midnight: ["#161c32", "#32456f", "#725580"],
  };
  function defaults() {
    return {
      version: 1,
      title: "把想法，变成值得展示的作品",
      subtitle: "PRODUCT WALKTHROUGH",
      palette: "aurora",
      ratio: "16:9",
      padding: 0.085,
      radius: 18,
      shadow: 35,
      trimStart: 0,
      trimEnd: 0,
      zoom: { enabled: false, start: 1, end: 4, scale: 1.65, x: 0.5, y: 0.5 },
      caption: "",
      captionStart: 0,
      captionEnd: 600,
      mask: { enabled: false, x: 0.68, y: 0.09, w: 0.24, h: 0.12 },
      source: null,
    };
  }
  function clamp(n, a, b) {
    const value = Number(n);
    return Math.max(a, Math.min(b, Number.isFinite(value) ? value : 0));
  }
  function validate(input) {
    if (!input || input.version !== 1) throw Error("不支持的工程版本");
    const p = { ...defaults(), ...input };
    if (!palettes[p.palette]) p.palette = "aurora";
    if (!["16:9", "9:16", "1:1"].includes(p.ratio)) p.ratio = "16:9";
    p.title = String(p.title).slice(0, 140);
    p.subtitle = String(p.subtitle).slice(0, 140);
    p.caption = String(p.caption).slice(0, 240);
    p.padding = clamp(p.padding, 0.03, 0.2);
    p.radius = clamp(p.radius, 0, 50);
    p.shadow = clamp(p.shadow, 0, 70);
    p.trimStart = clamp(p.trimStart, 0, 86400);
    p.trimEnd = clamp(p.trimEnd, 0, 86400);
    p.captionStart = clamp(p.captionStart, 0, 86400);
    p.captionEnd = clamp(p.captionEnd, 0, 86400);
    p.zoom = { ...defaults().zoom, ...p.zoom };
    p.zoom.enabled = p.zoom.enabled === true;
    for (const k of ["x", "y"]) p.zoom[k] = clamp(p.zoom[k], 0, 1);
    p.zoom.scale = clamp(p.zoom.scale, 1, 3);
    p.zoom.start = clamp(p.zoom.start, 0, 86400);
    p.zoom.end = clamp(p.zoom.end, 0, 86400);
    p.mask = { ...defaults().mask, ...p.mask };
    p.mask.enabled = p.mask.enabled === true;
    for (const k of ["x", "y", "w", "h"]) p.mask[k] = clamp(p.mask[k], 0, 1);
    return p;
  }
  function zoomAt(p, t) {
    const z = p.zoom;
    if (!z.enabled || z.end <= z.start || t < z.start || t > z.end) return 1;
    const ramp = Math.min(0.55, (z.end - z.start) / 2);
    const x = clamp(Math.min((t - z.start) / ramp, (z.end - t) / ramp), 0, 1);
    return 1 + (z.scale - 1) * (x * x * (3 - 2 * x));
  }
  function dimensions(r) {
    return r === "9:16"
      ? [1080, 1920]
      : r === "1:1"
        ? [1080, 1080]
        : [1920, 1080];
  }
  function duration(p) {
    return Math.max(0, p.trimEnd - p.trimStart);
  }
  function formatTime(s) {
    s = Math.max(0, Number(s) || 0);
    return `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(s % 60)
      .toString()
      .padStart(2, "0")}.${Math.floor((s % 1) * 10)}`;
  }
  return {
    palettes,
    defaults,
    validate,
    clamp,
    zoomAt,
    dimensions,
    duration,
    formatTime,
  };
});

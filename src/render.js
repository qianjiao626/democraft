/* Preview and export intentionally share this renderer. Coordinates are normalized to the source. */
(function () {
  const C = DemoCore;
  function rounded(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  }
  function fitText(ctx, text, x, y, maxWidth, size, color, align = "center") {
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.font = `600 ${size}px "Segoe UI", "Microsoft YaHei", sans-serif`;
    while (ctx.measureText(text).width > maxWidth && size > 12) {
      size -= 1;
      ctx.font = `600 ${size}px "Segoe UI", "Microsoft YaHei", sans-serif`;
    }
    ctx.fillText(text, x, y, maxWidth);
  }
  window.renderFrame = function (canvas, video, p, t) {
    const ctx = canvas.getContext("2d", { alpha: false }),
      W = canvas.width,
      H = canvas.height,
      u = Math.min(W, H) / 1080;
    ctx.save();
    const colors = C.palettes[p.palette];
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, colors[0]);
    bg.addColorStop(0.55, colors[1]);
    bg.addColorStop(1, colors[2]);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(
      W * 0.8,
      H * 0.12,
      0,
      W * 0.8,
      H * 0.12,
      W * 0.8,
    );
    glow.addColorStop(0, "#ffffff45");
    glow.addColorStop(1, "#ffffff00");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    const ink = p.palette === "midnight" ? "#f3eefc" : "#25273c";
    fitText(ctx, p.subtitle, W / 2, H * 0.075, W * 0.83, 16 * u, ink);
    fitText(ctx, p.title, W / 2, H * 0.138, W * 0.86, 40 * u, ink);
    const vw = video?.videoWidth || 1600,
      vh = video?.videoHeight || 900;
    const availableW = W * (1 - 2 * p.padding),
      availableH = H * (0.74 - p.padding * 0.55);
    const scale = Math.min(availableW / vw, availableH / vh);
    const fw = vw * scale,
      fh = vh * scale,
      x = (W - fw) / 2,
      y = H * 0.19 + (availableH - fh) / 2;
    ctx.shadowColor = "#13112670";
    ctx.shadowBlur = p.shadow * u;
    ctx.shadowOffsetY = 18 * u;
    ctx.fillStyle = "#1b1e29";
    rounded(ctx, x, y, fw, fh, p.radius * u);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.save();
    rounded(ctx, x, y, fw, fh, p.radius * u);
    ctx.clip();
    const z = C.zoomAt(p, t);
    const ox = x - (fw * z - fw) * p.zoom.x,
      oy = y - (fh * z - fh) * p.zoom.y;
    if (video?.readyState >= 2) {
      ctx.drawImage(video, ox, oy, fw * z, fh * z);
    } else {
      ctx.fillStyle = "#191d29";
      ctx.fillRect(x, y, fw, fh);
      ctx.fillStyle = "#2a3040";
      ctx.fillRect(x, y, fw, fh * 0.07);
      ["#f99582", "#e6c37f", "#87bba1"].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x + 23 * u + i * 20 * u, y + fh * 0.035, 5 * u, 0, Math.PI * 2);
        ctx.fill();
      });
      fitText(
        ctx,
        "Your product. In the spotlight.",
        W / 2,
        y + fh * 0.48,
        fw * 0.8,
        45 * u,
        "#f0f0f8",
      );
      fitText(
        ctx,
        "录下灵感  /  聚焦细节  /  分享作品",
        W / 2,
        y + fh * 0.6,
        fw * 0.8,
        21 * u,
        "#8e96ae",
      );
    }
    if (p.mask.enabled) {
      ctx.fillStyle = "#111318";
      ctx.fillRect(
        ox + p.mask.x * fw * z,
        oy + p.mask.y * fh * z,
        Math.min(p.mask.w, 1 - p.mask.x) * fw * z,
        Math.min(p.mask.h, 1 - p.mask.y) * fh * z,
      );
    }
    ctx.restore();
    if (p.caption && t >= p.captionStart && t <= p.captionEnd) {
      const cw = W * 0.82,
        ch = 62 * u,
        cy = H * 0.92 - ch / 2;
      ctx.fillStyle = "#10131ce8";
      rounded(ctx, (W - cw) / 2, cy, cw, ch, 12 * u);
      ctx.fill();
      fitText(
        ctx,
        p.caption,
        W / 2,
        cy + ch * 0.65,
        cw * 0.94,
        25 * u,
        "#ffffff",
      );
    }
    ctx.restore();
  };
})();

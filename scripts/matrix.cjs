const projectRoot = require("node:path").resolve(__dirname, "..");
process.chdir(require("node:path").dirname(projectRoot));
const { _electron: electron } = require("playwright"),
  path = require("path"),
  fs = require("fs"),
  assert = require("node:assert/strict"),
  { execFileSync } = require("child_process");
(async () => {
  const app = await electron.launch({
    executablePath: path.resolve(
      "democraft/node_modules/electron/dist/electron.exe",
    ),
    args: [path.resolve("democraft")],
  });
  try {
    const page = await app.firstWindow();
    let errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await app.evaluate(
      ({ dialog }, file) =>
        (dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        })),
      path.resolve("democraft/artifacts/test-source.mp4"),
    );
    await page.click("#import");
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("素材已就绪"),
    );
    await page.fill("#trimStart", "0.5");
    await page.locator("#trimStart").dispatchEvent("change");
    await page.fill("#trimEnd", "1.5");
    await page.locator("#trimEnd").dispatchEvent("change");
    await page.check('[data-bind="zoom.enabled"]');
    await page.locator("details").last().locator("summary").click();
    await page.check('[data-bind="mask.enabled"]');
    for (const [ratio, width, height] of [
      ["9:16", 1080, 1920],
      ["1:1", 1080, 1080],
    ]) {
      await page.selectOption("#ratio", ratio);
      const out = path.resolve(
        `democraft/artifacts/matrix-${width}x${height}.mp4`,
      );
      await app.evaluate(
        ({ dialog }, file) =>
          (dialog.showSaveDialog = async () => ({
            canceled: false,
            filePath: file,
          })),
        out,
      );
      await page.click("#export");
      await page.waitForSelector("#export-dialog[open]");
      await page.waitForFunction(
        () =>
          document.querySelector("#export-heading").textContent ===
          "你的作品，已准备好。",
        {},
        { timeout: 120000 },
      );
      const probe = JSON.parse(
        execFileSync(
          "ffprobe",
          ["-v", "error", "-show_streams", "-show_format", "-of", "json", out],
          { encoding: "utf8" },
        ),
      );
      assert.equal(probe.streams[0].width, width);
      assert.equal(probe.streams[0].height, height);
      assert.equal(Number(probe.format.duration), 1);
      assert.equal(probe.streams[0].nb_frames, "30");
      assert.equal(probe.streams[1].codec_name, "aac");
      console.log("PASS ratio, trim, zoom+mask export", ratio);
      await page.click("#cancel-export");
    }
    assert.deepEqual(errors, []);
    console.log("PASS no renderer exceptions");
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

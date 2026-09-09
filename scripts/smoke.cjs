const projectRoot = require("node:path").resolve(__dirname, "..");
process.chdir(require("node:path").dirname(projectRoot));
const { _electron: electron } = require("playwright");
const path = require("node:path");
(async () => {
  const app = await electron.launch({
    executablePath: path.resolve(
      "democraft/node_modules/electron/dist/electron.exe",
    ),
    args: [path.resolve("democraft")],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" },
  });
  const page = await app.firstWindow();
  page.on("pageerror", (e) => console.error("PAGEERROR", e));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE", m.text());
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "democraft/artifacts/empty.png" });
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, path.resolve("democraft/artifacts/test-source.mp4"));
  await page.click("#import");
  await page.waitForFunction(
    () =>
      document.querySelector("#asset-name").textContent === "test-source.mp4",
  );
  await page.waitForTimeout(700);
  console.log("STATUS", await page.locator("#status").textContent());
  console.log("META", await page.locator("#asset-meta").textContent());
  await page.screenshot({ path: "democraft/artifacts/editor.png" });
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, path.resolve("democraft/artifacts/smoke-export.mp4"));
  await page.fill('[data-bind="caption"]', "本地创作，精彩呈现");
  await page.locator('[data-bind="caption"]').dispatchEvent("change");
  await page.click('[data-palette="ember"]');
  await page.waitForTimeout(1200);
  await page.click("#export");
  await page.waitForFunction(
    () =>
      document.querySelector("#status").textContent.includes("MP4 导出成功"),
    {},
    { timeout: 180000 },
  );
  console.log("EXPORT", await page.locator("#status").textContent());
  await page.screenshot({ path: "democraft/artifacts/export.png" });
  await app.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

const projectRoot = require("node:path").resolve(__dirname, "..");
process.chdir(require("node:path").dirname(projectRoot));
const { _electron: electron } = require("playwright");
const path = require("path");
const fs = require("fs");
(async () => {
  const app = await electron.launch({
    executablePath: path.resolve(
      "democraft/node_modules/electron/dist/electron.exe",
    ),
    args: [path.resolve("democraft")],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" },
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(async ({ BrowserWindow }, file) => {
      global.fixture = new BrowserWindow({
        width: 1400,
        height: 920,
        autoHideMenuBar: true,
        title: "Orbit demo fixture",
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });
      await global.fixture.loadFile(file);
    }, path.resolve("democraft/scripts/demo-fixture.html"));
    await page.bringToFront();
    await page.click("#record");
    await page.waitForFunction(
      () => document.querySelectorAll("#sources button").length > 0,
    );
    await page
      .locator("#sources button")
      .filter({ hasText: "Orbit — Product demo fixture" })
      .click();
    await page.waitForFunction(() =>
      document.querySelector("#record").classList.contains("recording"),
    );
    await page.waitForTimeout(6500);
    await page.click("#record");
    await page.waitForFunction(
      () =>
        document
          .querySelector("#asset-name")
          .textContent.startsWith("recording-") &&
        !document.querySelector("#import").disabled,
      {},
      { timeout: 30000 },
    );
    await page.waitForTimeout(1100);
    const p = await page.evaluate(() => studio.recover());
    fs.copyFileSync(p.source.path, "democraft/assets/orbit-demo.webm");
    await app.evaluate(() => global.fixture.close());
    await page.fill('[data-bind="title"]', "让你的产品，成为焦点。");
    await page.locator('[data-bind="title"]').dispatchEvent("change");
    await page.fill(
      '[data-bind="caption"]',
      "一次录屏，就能做出清晰、精致的产品演示",
    );
    await page.locator('[data-bind="caption"]').dispatchEvent("change");
    await page.click('[data-palette="ember"]');
    await page.check('[data-bind="zoom.enabled"]');
    await page.fill('[data-bind="zoom.start"]', "1");
    await page.locator('[data-bind="zoom.start"]').dispatchEvent("change");
    await page.fill('[data-bind="zoom.end"]', "5");
    await page.locator('[data-bind="zoom.end"]').dispatchEvent("change");
    await page.evaluate(() => {
      document.querySelector("#video").currentTime = 2;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: "democraft/assets/screenshot.png" });
    await app.evaluate(
      ({ dialog }, file) =>
        (dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: file,
        })),
      path.resolve("democraft/assets/showcase.mp4"),
    );
    await page.click("#export");
    await page.waitForFunction(
      () =>
        document.querySelector("#status").textContent.includes("MP4 导出成功"),
      {},
      { timeout: 240000 },
    );
    console.log(await page.locator("#status").textContent());
    await page.click("#cancel-export");
    await page.waitForTimeout(900);
    const saved = await page.evaluate(() => studio.recover());
    delete saved.source;
    fs.writeFileSync(
      "democraft/assets/showcase-style.json",
      JSON.stringify(saved, null, 2),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

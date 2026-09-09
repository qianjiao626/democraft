const projectRoot = require("node:path").resolve(__dirname, "..");
process.chdir(require("node:path").dirname(projectRoot));
const { _electron: electron } = require("playwright");
const path = require("path");
const fs = require("fs");
const assert = require("node:assert/strict");
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
    page.on("pageerror", (e) => console.error("PAGEERROR", e));
    await page.waitForTimeout(700);
    const source = path.resolve("democraft/artifacts/test-source.mp4"),
      saved = path.resolve("democraft/artifacts/test-project.democraft");
    await app.evaluate(
      ({ dialog }, file) =>
        (dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        })),
      source,
    );
    await page.click("#import");
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("素材已就绪"),
    );
    await page.fill('[data-bind="title"]', "工程保存与重开测试");
    await page.locator('[data-bind="title"]').dispatchEvent("change");
    await page.click("#undo");
    assert.notEqual(
      await page.inputValue('[data-bind="title"]'),
      "工程保存与重开测试",
    );
    await page.click("#redo");
    assert.equal(
      await page.inputValue('[data-bind="title"]'),
      "工程保存与重开测试",
    );
    await app.evaluate(
      ({ dialog }, file) =>
        (dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: file,
        })),
      saved,
    );
    await page.click("#save");
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("工程已保存"),
    );
    assert.equal(
      JSON.parse(fs.readFileSync(saved)).title,
      "工程保存与重开测试",
    );
    await page.click("#save");
    await page.waitForTimeout(300);
    assert.equal(
      JSON.parse(fs.readFileSync(saved)).title,
      "工程保存与重开测试",
    );
    await page.selectOption("#ratio", "9:16");
    await page.click('[data-palette="mint"]');
    await app.evaluate(
      ({ dialog }, file) =>
        (dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        })),
      saved,
    );
    await page.click("#open");
    await page.waitForFunction(
      () => document.querySelector("#ratio").value === "16:9",
    );
    assert.equal(
      await page.inputValue('[data-bind="title"]'),
      "工程保存与重开测试",
    );
    console.log("PASS project save/overwrite/open + undo/redo");
    const cancelFile = path.resolve("democraft/artifacts/cancelled.mp4");
    await app.evaluate(
      ({ dialog }, file) =>
        (dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: file,
        })),
      cancelFile,
    );
    await page.click("#export");
    await page.waitForSelector("#export-dialog[open]");
    await page.click("#cancel-export");
    await page.waitForFunction(
      () => !document.querySelector("#export").disabled,
    );
    assert.equal(fs.existsSync(cancelFile), false);
    console.log("PASS export cancellation");
    // Create only our own synthetic test window. Never record user windows or desktop.
    await app.evaluate(async ({ BrowserWindow }) => {
      global.fixture = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "DemoCraft-Test-Fixture",
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });
      await global.fixture.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            '<html><head><title>Capture Fixture</title></head><body style="background:#17252b;color:white;font:36px sans-serif;padding:80px"><h1>Capture Fixture</h1><p>Synthetic test content. No personal data.</p><div id="tick"></div><script>setInterval(()=>document.querySelector("#tick").textContent=Date.now(),100)</script></body></html>',
          ),
      );
    });
    await page.bringToFront();
    await page.click("#record");
    await page.waitForFunction(
      () => document.querySelectorAll("#sources button").length > 0,
    );
    console.log("SOURCE COUNT", await page.locator("#sources button").count());
    const fixture = page
      .locator("#sources button")
      .filter({ hasText: "Capture Fixture" });
    assert.equal(await fixture.count(), 1);
    await fixture.click();
    await page.waitForFunction(
      () => document.querySelector("#record").classList.contains("recording"),
      {},
      { timeout: 20000 },
    );
    await page.waitForTimeout(2500);
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
    const seekResult = await page.evaluate(async () => {
      const v = document.querySelector("#video");
      v.currentTime = 1;
      await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
      return v.currentTime;
    });
    assert.ok(Math.abs(seekResult - 1) < 0.05);
    console.log("PASS recording seek");
    console.log(
      "PASS real window recording",
      await page.locator("#asset-meta").textContent(),
    );
    console.log("STATUS", await page.locator("#status").textContent());
    await page.waitForTimeout(1100);
    const data = await page.evaluate(() => studio.recover());
    assert.ok(data.source.path.endsWith(".webm"));
    fs.copyFileSync(
      data.source.path,
      "democraft/artifacts/recording-test.webm",
    );
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
})();

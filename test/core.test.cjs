const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");
test("defaults are valid and independent", () => {
  const a = C.defaults(),
    b = C.defaults();
  a.zoom.x = 0.1;
  assert.equal(b.zoom.x, 0.5);
  assert.deepEqual(C.validate(b), b);
});
test("validation rejects unsupported projects", () => {
  assert.throws(() => C.validate(null));
  assert.throws(() => C.validate({ version: 2 }));
});
test("validation bounds layout, strings, coordinates and aspect", () => {
  const p = C.validate({
    ...C.defaults(),
    ratio: "bad",
    palette: "bad",
    padding: 99,
    title: "x".repeat(200),
    zoom: { scale: 99, x: -2 },
    mask: { w: 10 },
  });
  assert.equal(p.ratio, "16:9");
  assert.equal(p.palette, "aurora");
  assert.equal(p.padding, 0.2);
  assert.equal(p.title.length, 140);
  assert.equal(p.zoom.scale, 3);
  assert.equal(p.zoom.x, 0);
  assert.equal(p.mask.w, 1);
});
test("zoom ramps smoothly and resets outside range", () => {
  const p = C.defaults();
  p.zoom = { enabled: true, start: 1, end: 4, scale: 2, x: 0.5, y: 0.5 };
  assert.equal(C.zoomAt(p, 0), 1);
  assert.equal(C.zoomAt(p, 1), 1);
  assert.equal(C.zoomAt(p, 2), 2);
  assert.equal(C.zoomAt(p, 4), 1);
  assert.equal(C.zoomAt(p, 5), 1);
  assert.ok(C.zoomAt(p, 1.2) > 1 && C.zoomAt(p, 1.2) < 2);
  assert.ok(Math.abs(C.zoomAt(p, 1.2) - C.zoomAt(p, 3.8)) < 1e-10);
});
test("degenerate zoom has no division by zero", () => {
  const p = C.defaults();
  p.zoom.enabled = true;
  p.zoom.start = 2;
  p.zoom.end = 2;
  assert.equal(C.zoomAt(p, 2), 1);
});
test("short zoom interval stays finite", () => {
  const p = C.defaults();
  p.zoom.enabled = true;
  p.zoom.start = 1;
  p.zoom.end = 1.1;
  for (let t = 0.9; t < 1.2; t += 0.001)
    assert.ok(Number.isFinite(C.zoomAt(p, t)));
});
test("output dimensions are codec-compatible even numbers", () => {
  for (const r of ["16:9", "9:16", "1:1"])
    for (const n of C.dimensions(r)) assert.equal(n % 2, 0);
  assert.deepEqual(C.dimensions("9:16"), [1080, 1920]);
});
test("duration and time labels", () => {
  assert.equal(C.duration({ trimStart: 5, trimEnd: 2 }), 0);
  assert.equal(C.duration({ trimStart: 2, trimEnd: 5 }), 3);
  assert.equal(C.formatTime(65.5), "01:05.5");
  assert.equal(C.formatTime(-1), "00:00.0");
});

import test from "node:test";
import assert from "node:assert/strict";
import { inferIsWebBrowserFromInstalledApp } from "./installedWebBrowserInference";

test("inferIsWebBrowserFromInstalledApp matches exe basenames", () => {
  assert.equal(
    inferIsWebBrowserFromInstalledApp({
      name: "Irrelevant",
      executablePath:
        "C:\\Program Files\\BraveSoftware\\Brave\\Application\\Brave.exe",
    }),
    true,
  );
  assert.equal(
    inferIsWebBrowserFromInstalledApp({
      name: "Irrelevant",
      executablePath: "C:\\Users\\Me\\vivaldi.exe",
    }),
    true,
  );
});

test("inferIsWebBrowserFromInstalledApp matches common display names", () => {
  assert.equal(inferIsWebBrowserFromInstalledApp({ name: "Brave" }), true);
  assert.equal(inferIsWebBrowserFromInstalledApp({ name: "Zen Browser" }), true);
  assert.equal(inferIsWebBrowserFromInstalledApp({ name: "Opera GX" }), true);
  assert.equal(
    inferIsWebBrowserFromInstalledApp({ name: "Google Chrome Canary" }),
    true,
  );
  assert.equal(inferIsWebBrowserFromInstalledApp({ name: "Arc" }), true);
});

test("inferIsWebBrowserFromInstalledApp ignores non-.exe basename leaves", () => {
  assert.equal(
    inferIsWebBrowserFromInstalledApp({
      name: "",
      executablePath: "C:\\no\\extension\\chrome",
    }),
    false,
  );
});

test("inferIsWebBrowserFromInstalledApp rejects unrelated apps", () => {
  assert.equal(
    inferIsWebBrowserFromInstalledApp({
      name: "Calculator",
      executablePath: "C:\\Windows\\System32\\calc.exe",
    }),
    false,
  );
  assert.equal(
    inferIsWebBrowserFromInstalledApp({
      name: "Notepad",
      executablePath: "C:\\Windows\\notepad.exe",
    }),
    false,
  );
});

test("inferIsWebBrowserFromInstalledApp treats *browser* in title as legacy heuristic", () => {
  assert.equal(
    inferIsWebBrowserFromInstalledApp({ name: "Acme Weird Browser Nightly" }),
    true,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import type { LaunchAction } from "../hooks/useLaunchFeedback";
import {
  collectLinkedTabsAfterApp,
  findOwningAppForTabAction,
  orderLaunchActionsForProgressDisplay,
  resolveActionLeadForProgressCard,
  shouldSkipBucketActionForNestedTabDisplay,
} from "./launchTimelineDisplayOrder";

const app = (overrides: Partial<LaunchAction>): LaunchAction => ({
  id: "app:x",
  kind: "app",
  title: "Edge",
  state: "queued",
  startedAtMs: null,
  endedAtMs: null,
  pills: null,
  smartDecisions: null,
  errorMessage: null,
  failureKind: null,
  substeps: null,
  ...overrides,
});

const tab = (overrides: Partial<LaunchAction>): LaunchAction => ({
  id: "tab:y",
  kind: "tab",
  title: "github.com",
  state: "queued",
  startedAtMs: null,
  endedAtMs: null,
  pills: null,
  smartDecisions: null,
  errorMessage: null,
  failureKind: null,
  substeps: null,
  ...overrides,
});

test("orderLaunchActionsForProgressDisplay prefers hostAppInstanceId over URL collision", () => {
  const actions: LaunchAction[] = [
    app({
      id: "app:chrome-a",
      title: "Google Chrome",
      contentItems: [{ name: "github", type: "link", path: "https://github.com/chrome" }],
    }),
    app({
      id: "app:edge-b",
      title: "Microsoft Edge",
      contentItems: [{ name: "github", type: "link", path: "https://github.com/edge" }],
    }),
    tab({
      id: "tab:1",
      title: "github.com",
      browserTabUrl: "https://github.com/org/repo",
      hostAppInstanceId: "edge-b",
    }),
  ];
  const ordered = orderLaunchActionsForProgressDisplay(actions);
  assert.deepEqual(
    ordered.map((a) => a.id),
    ["app:chrome-a", "app:edge-b", "tab:1"],
  );
});

test("orderLaunchActionsForProgressDisplay groups tab actions after owning app by URL", () => {
  const actions: LaunchAction[] = [
    app({
      id: "app:edge",
      title: "Microsoft Edge",
      contentItems: [
        { name: "github.com", type: "link", path: "https://github.com/foo" },
        { name: "youtube.com", type: "link", path: "https://www.youtube.com/watch?v=1" },
      ],
    }),
    app({ id: "app:aud", title: "Audacity" }),
    tab({ id: "tab:1", title: "github.com", browserTabUrl: "https://github.com/foo" }),
    tab({ id: "tab:2", title: "youtube.com", browserTabUrl: "https://www.youtube.com/watch?v=1" }),
  ];
  const ordered = orderLaunchActionsForProgressDisplay(actions);
  assert.deepEqual(
    ordered.map((a) => a.id),
    ["app:edge", "tab:1", "tab:2", "app:aud"],
  );
});

test("orderLaunchActionsForProgressDisplay leaves orphan tabs at the end", () => {
  const actions: LaunchAction[] = [
    app({ id: "app:a", title: "Notepad" }),
    tab({ id: "tab:orphan", title: "example.com", browserTabUrl: "https://example.com/" }),
  ];
  const ordered = orderLaunchActionsForProgressDisplay(actions);
  assert.deepEqual(
    ordered.map((a) => a.id),
    ["app:a", "tab:orphan"],
  );
});

test("collectLinkedTabsAfterApp returns consecutive tab actions after an app", () => {
  const ordered: LaunchAction[] = [
    app({ id: "app:edge", title: "Edge", contentItems: [{ name: "x", type: "link", path: "https://a.com/" }] }),
    tab({ id: "tab:1", browserTabUrl: "https://a.com/page" }),
    tab({ id: "tab:2", browserTabUrl: "https://a.com/other" }),
    app({ id: "app:aud", title: "Audacity" }),
  ];
  const tabs = collectLinkedTabsAfterApp(ordered[0], ordered);
  assert.equal(tabs.length, 2);
  assert.deepEqual(tabs.map((t) => t.id), ["tab:1", "tab:2"]);
});

test("findOwningAppForTabAction resolves nearest prior app with matching link", () => {
  const ordered: LaunchAction[] = [
    app({
      id: "app:edge",
      title: "Edge",
      contentItems: [{ name: "efficient", type: "link", path: "https://efficient.app/" }],
    }),
    tab({ id: "tab:eff", title: "efficient.app", browserTabUrl: "https://efficient.app/foo" }),
  ];
  const owner = findOwningAppForTabAction(ordered[1], ordered);
  assert.ok(owner);
  assert.equal(owner?.id, "app:edge");
});

test("shouldSkipBucketActionForNestedTabDisplay is true for owned tabs", () => {
  const ordered: LaunchAction[] = [
    app({
      id: "app:edge-x",
      title: "Edge",
      contentItems: [{ name: "x", type: "link", path: "https://a.com/" }],
    }),
    tab({ id: "tab:1", browserTabUrl: "https://a.com/z", hostAppInstanceId: "edge-x" }),
  ];
  assert.equal(shouldSkipBucketActionForNestedTabDisplay(ordered[1], ordered), true);
  assert.equal(shouldSkipBucketActionForNestedTabDisplay(ordered[0], ordered), false);
});

test("resolveActionLeadForProgressCard nests tab under owning app", () => {
  const ordered: LaunchAction[] = [
    app({
      id: "app:edge",
      title: "Microsoft Edge",
      contentItems: [{ name: "efficient", type: "link", path: "https://efficient.app/" }],
    }),
    tab({ id: "tab:1", title: "efficient.app", browserTabUrl: "https://efficient.app/x" }),
  ];
  const lead = resolveActionLeadForProgressCard(ordered[1], ordered);
  assert.equal(lead.primary.id, "app:edge");
  assert.equal(lead.linkedTabs.length, 1);
  assert.equal(lead.emphasisTabId, "tab:1");
});

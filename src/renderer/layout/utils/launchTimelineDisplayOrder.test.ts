import test from "node:test";
import assert from "node:assert/strict";
import type { LaunchAction } from "../hooks/useLaunchFeedback";
import { orderLaunchActionsForProgressDisplay } from "./launchTimelineDisplayOrder";

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

test("orderLaunchActionsForProgressDisplay matches by hostname when paths differ", () => {
  const actions: LaunchAction[] = [
    app({
      id: "app:edge",
      title: "Microsoft Edge",
      contentItems: [
        { name: "youtube.com", type: "link", path: "https://www.youtube.com/" },
      ],
    }),
    tab({
      id: "tab:watch",
      title: "youtube.com",
      browserTabUrl: "https://www.youtube.com/watch?v=abc",
    }),
    app({ id: "app:aud", title: "Audacity" }),
  ];
  const ordered = orderLaunchActionsForProgressDisplay(actions);
  assert.deepEqual(
    ordered.map((a) => a.id),
    ["app:edge", "tab:watch", "app:aud"],
  );
});

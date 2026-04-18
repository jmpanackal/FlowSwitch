# FlowSwitch Feature Braindump

Drop ideas in the inbox as fast bullet points.
No formatting required.
I will normalize, label, and review items later.

## Inbox (Unreviewed Only)

Add new ideas here as raw bullets.
After review, move them to `Reviewed Raw Archive` and keep this section small.

- check computer temps/task manager consumption or overall machine load and use it to adapt launch behavior or warn users when launch workload may over-tax CPU/memory.
- support for ultra wide monitors along with presets for window layouts for ultrawides

## Reviewed Raw Archive (Reference Only)

These ideas have already been reviewed/formalized into the backlog below.
Do not include these in the next review pass unless they are explicitly reopened.

### Archive Batch A (reviewed 2026-04-17)

- Flowswitch should either be brought to front while launching apps so we can see the current status/progress or it should have a loading screen thats stays above all screens and shows progress per app and overall progress. either way we need an easy way to see progress/status during launch because currently apps launch and are placed over the application. We could also show progress on the icon in the taskbar
- The flowswitch icon should have a light gradient like many modern apps. The outline could also be cloud shaped like Codex app icon maybe.
- global setting for what to do with flowswitch application when done. bring to front / close / minimize / maximize / minimize to system tray
- add audio feedback for when all apps have launched as an extra feedback modality
- in monitor layout preview, we could use some kind of visual effect (icon / background color / etc) to make the app windows in monitors convey status like currently launched on this monitor, currently launched but minimized, not currently launched, etc. This would be for extra feedback and conveying status simply. Each app window in the monitor layout preview could also fill up and have a  color like red when fail, green when full success, yellow when need confirmation. This may clutter the interface but something to consider
-app serach bar has no 'clear' button
- still need to hide system utitlities and uninstallers and non-apps like those. We also still are not displaying all actual apps for example for me spotify, file explorer, task manager, codex are not appearing in search.
- should be able to create a new profile from anywhere, not just the when the profiles tab in sidebar is open
- need a way to hide the sidebars easily, could use sidebar open close buttons in the title bar
- some apps stil dont have icons, need a way to get icons for all apps
- include new reapply layout button, if all apps are launched already, flowswitch detects them and moves them all back into place without relauncing all (could just be built in to launch button if we add the detection)
- allow swithcing profile by right clicking taskbar icon for flowswitch (very good idea)
- allow clicking on the entire app card in apps sidebar tab to drag instead of just icon, clicking anaywhere on the app card allows dragging of the icon. this allows user to not need to be super accurate when clicking an app to drag it
- in edit mode, empty spaces on a monitor could have a plus sign that when clicked allows them to easily add an app into that spot (could make things cluttered if done wrong)
- add ability to launch apps containing files, folders, tabs, or other content, and add ability to launch files or folders with certain apps
- allow users to exclude apps from the apps search list (very useful)
- allow users to favorite apps or apply tags to them.
- make flowswitch more responsive/adapative to small window size usage since the nature of the app means many people many not use it fullscreen. Many people would use it at a smaller size.
- consider turning edit profile/save profile into a toggle switch between view mode and edit mode with auto save funcitonality.
- allow closing of the right sidebar by clicking off of the selected app in a area other than the right sidebar
- add hotkeys to launch profiles (very useful)
- add ability to cancel launch of a profile (very useful)
- make the monitors in the monitor layout preview better utilize the space, they dont take up as much space as they could/should currently
- allow monitors to be placed above or below each other in the monitor layout preview for people who have setups with monitors vertically stacked
- add constraints on launching too many apps, if a user adds 50 apps to a profile it could take a long time to launch or cause other issues. We should prevent or warn them about this with hard or soft constraints and messages.
- remove the text in the top left saying FlowSwitch Profiles, apps, layouts along with the import, export, and settings buttons. Instead make the flowsiwitch icon in the top left in the title bar a clickable dropdown that contains import export and global settings options
- consider possible use cases for tabs in the title bar?
- add ability to Set a profile to run on startup
- set profile to launch at a certain time
- turn on auto save for current profile. It saves your app layout every X minutes and updates that profile with the updated layout so users can easily save where they left off. consider a manual 'resave/overwrite profile with app layout memory' hotkey
- mini floating profile switcher widget like obs stuudio preview dock or something
- Add “noise meter” that shows how many distractions (non-profile apps) are running
- Mobile companion app to launch desktop profiles remotely (not anywhere near this but a cool idea)
- built in timer (optional setting to turn on for certain profiles) (interesting but not very important)
- add ability to change size of monitors in monitor layout preview
- in profiles tab, add plus button under last profile to easily create a new profile
- fix monitor layout dropdown to be better size and issue with clicking dropdown option above an app on the monitor where it tries to click the app instead of selecting the dropdown option
- clean up codebase to not shove all logic in main.js. Needs to be more readable as well, better commmenting and use best practices
- add global or profiles options for what to do with existing apps on profile launch (minimize all, close all, end task on all, ignore all, etc)
- add profile option to determine launch sequence if user cares about order of launch or needs a specific launch order
- Launch Sequence:  cinematic "Launch State" modal with a small bring to front reactive progress bar, payload logging, and a 3.2s countdown that resets to the app view upon completion. (could be related to other braindump features or ideas)
- Reorder the on hover buttons in th top right of apps in MLP. make them match normal windows , minimize, maximize, X out.
- icons are not resized when the flowswitch app window is resized, they need to be responsive and adaptive as well to remain same size relative to the text
- add modern light opacity dot grid background to monitor layout preview to give that editor space look (potential to look good or not, need to test it to see)
- implement close all apps in profile option
- indicate how many apps in the profile are already open
- Business focused variant of flow switch: Use AI to generate an example workspace monitor layout and app selection based on prompts. For example, the user will have all their apps and files and bookmarked links tagged or sorted in some way, they will prompt the ai to create a workspace with certain conditions, it will generate an example layout with apps files tabs setup optimally and the user can create a profile out of that and configure/launch it. FOR EXAMPLE: Let’s say a user is working and gets a slack message saying a feature they previously worked on has a bug that needs to be fixed. The user can paste that prompt into the AI and say create a workspace based on this, and paste the message. Assuming the AI has learned what apps tabs files are related to that, it will populate the monitor layout preview with the relevant content things. I would love a feature like that for work and I’m sure it has many other possible uses (very far down the line if even possible)
- Add a GeForce overlay type feature so users can quickly hotkey to open a profile selector with just monitor layouts next to profile names for quick switching between profiles

## Reviewed / Formalized

This section converts raw inbox notes into a normalized product backlog.
It groups related ideas, removes duplication, and assigns priority, scope, and readiness.

### Evaluation Snapshot

- Strongest value concentration is in launch reliability/feedback, app discovery quality, and layout editor usability.
- Several ideas overlap and should be treated as single initiatives (for example launch progress + launch modal + completion feedback).
- A few items are high upside but low readiness and should remain exploratory (AI workspace generation, mobile companion).
- UI polish requests are useful but should follow core reliability and workflow completion work.

### Formalized Backlog (Now / Next / Later)

#### Now (P0: core product value and reliability)

1. Launch visibility and control

- Problem: users lose visibility during profile launch because opened windows can hide FlowSwitch.
- Scope:
  - persistent launch progress surface (foreground app state, always-on-top overlay, or taskbar progress)
  - per-app and overall status (queued, launching, success, failed, needs confirmation)
  - user-triggered cancel launch action
  - completion feedback option (audio cue)
- Merged inbox items: launch progress visibility, launch modal concept, cancel launch, done audio signal, "already open" count.
- Done when: users can always see launch state, cancel safely, and understand completion/partial failure without guessing.

1. App discovery completeness and hygiene

- Problem: app list currently misses real apps and includes noise entries.
- Scope:
  - improve detection coverage (examples noted: Spotify, File Explorer, Task Manager, Codex)
  - hide system utilities/uninstallers/non-app entries
  - icon fallback pipeline for apps missing icons
  - list-level controls: exclude app from search, favorites/tags
- Merged inbox items: missing apps, hide non-apps, missing icons, exclude apps, favorites/tags.
- Done when: discovery feels trustworthy, searchable list is clean, and most apps show valid icons.

1. Safe launch guardrails for large profiles

- Problem: very large profiles can degrade reliability and UX.
- Scope:
  - define soft threshold warning and hard threshold constraints
  - explain expected launch duration/risk before run
  - optional launch sequencing support for dependency-sensitive apps
- Merged inbox items: constraints for too many apps, profile launch order.
- Done when: users are warned/protected before risky launches and can intentionally choose launch order.

#### Next (P1: usability and workflow acceleration)

1. Layout preview status semantics

- Problem: monitor layout preview does not clearly communicate runtime state.
- Scope:
  - per-window status styling in preview (not launched, launched, minimized, failed, needs confirmation)
  - keep visual system minimal to avoid clutter
- Done when: runtime state is understandable from preview at a glance.

1. Reapply layout without relaunch

- Problem: users need to restore placements for already-running profile apps.
- Scope:
  - detect matching open profile apps
  - move/resize/re-place without relaunching app processes
  - optional integration with primary Launch action (smart relaunch vs reapply decision)
- Done when: users can recover layout state quickly without full restart.

1. Faster profile access and switching

- Problem: profile actions are too constrained to current view.
- Scope:
  - create profile from multiple surfaces (not only Profiles sidebar context)
  - taskbar/tray right-click profile switch
  - hotkeys for profile launch and quick selector overlay
  - explicit "run on startup" option per profile
- Merged inbox items: create from anywhere, taskbar switching, hotkeys, startup run, GeForce-style quick switcher.
- Done when: launching/switching profiles requires minimal navigation friction.

1. Layout editor ergonomics

- Problem: editing is click-precision heavy and some controls are awkward.
- Scope:
  - drag from full app card (not icon only)
  - optional "+" affordance for empty slots in edit mode
  - support vertically stacked monitor arrangements
  - allow monitor tile size tuning in preview
  - fix monitor-layout dropdown click interception bug
  - reorder hover window controls to native order
- Done when: common edit operations are easy, predictable, and low-friction.

1. Responsive UI behavior at smaller window sizes

- Problem: non-fullscreen usage is common, but responsiveness is currently weak.
- Scope:
  - improve narrow-width layout behavior
  - make icon sizing adaptive with window resize
  - optimize monitor-preview space utilization
  - support easy sidebar hide/show controls
  - allow close-right-sidebar by clicking outside selected app context
- Done when: app remains readable, usable, and visually consistent at reduced sizes.

#### Later (P2: valuable extensions after core workflow maturity)

1. Launch policy controls for existing/open apps

- Scope:
  - global/profile policy: minimize all, close all, end task, ignore, etc.
  - optional "close all apps in profile" command
- Done when: users can consistently define conflict behavior with existing windows/processes.

1. Profile autosave and timed/scheduled launch

- Scope:
  - periodic layout autosave with profile overwrite policy
  - manual "resave current layout" shortcut
  - schedule launch at user-defined times
- Done when: users can preserve and re-run routine states with minimal manual maintenance.

1. Expanded launch targets and content-aware launching

- Scope:
  - launch files/folders/tabs as first-class profile items
  - open files/folders with selected target applications
- Done when: profiles orchestrate not only apps but working context payloads.

1. Information architecture and top-bar simplification

- Scope:
  - move import/export/settings into top-left icon dropdown
  - reevaluate title-bar tabs only if it unlocks clear workflow value
  - add quick create profile affordance in profiles list
- Done when: top-level controls are discoverable with less visual clutter.

1. Visual style enhancements (defer until workflow polish is stable)

- Scope:
  - icon refresh exploration (light gradient/cloud contour concepts)
  - optional subtle dot-grid background for editor surface
- Done when: visual updates reinforce clarity without harming contrast/performance.

#### Long-Horizon / Incubator (R&D)

1. AI-generated workspace blueprints (business variant)

- Concept: generate suggested profile layout/app/file/tab setup from natural-language intent.
- Risk: requires reliable metadata graph, relevance ranking, and strong trust/explainability UX.
- Recommendation: keep as incubation theme; do not commit roadmap slot yet.

1. Mobile remote profile launcher

- Concept: companion app triggers desktop profile switching remotely.
- Risk: security model, auth/session handling, and cross-device complexity.
- Recommendation: revisit only after desktop orchestration and reliability goals are stable.

### Candidate Sequencing

1. Launch visibility/control (Item 1)
2. App discovery completeness/hygiene (Item 2)
3. Launch guardrails + sequence controls (Item 3)
4. Reapply layout + preview status semantics (Items 5 + 4)
5. Profile access acceleration + editor ergonomics (Items 6 + 7)
6. Responsive UI pass (Item 8)
7. Later-phase policy/automation/targets/polish items (9-13)
8. Incubator exploration only when foundation is stable (14-15)

### Notes for Future Spec Work

- Convert each "Now" item into a dedicated design spec before implementation.
- For each spec, define explicit acceptance criteria and non-goals to avoid scope creep.
- Track dependencies between launch pipeline changes and renderer status UX so sequencing stays realistic.


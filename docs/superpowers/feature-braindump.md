# FlowSwitch Feature Braindump

Drop ideas in the inbox as fast bullet points.
No formatting required.
I will normalize, label, and review items later.

## Inbox (Unreviewed Only)

Add new ideas here as raw bullets.
After review, move them to `Reviewed Raw Archive` and keep this section small.

*(empty — last intake reviewed 2026-04-27, see Archive Batch C)*


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

### Archive Batch B (reviewed 2026-04-19)

- check computer temps/task manager consumption or overall machine load and use it to adapt launch behavior or warn users when launch workload may over-tax CPU/memory.
- support for ultra wide monitors along with presets for window layouts for ultrawides
- Change what is pinned to the taskbar per profile
- Option to restrict profiles at times or based on other criteria to prevent distractions or for kids
- Standardize styling for reused features like dropdowns, settings modals, etc
- What if the whole header section was a big launch button since that is the primary function users will be doing? Or just a very large launch button. Or if the launch button said Launch 'name of profie here' to make it even more obvious
- use dot styling background like google stitch and floating sidebars to create a working space effect
- rename profiles by clicking onn their name in the header and it lets you edit in place and clicking off saves the new name
- fix display of content bubble tooltips in Monitor layout on hover or remove the on hover text

### Archive Batch C (reviewed 2026-04-27)

- hide apps button for apps in sidebar that user decides they will never launch with flowswitch (also add filter to show/hide hidden apps)
- change profile cards to display a list of app icons under instead of x monitors, x apps, x tabs, makes it easier to tell whats in the profile
- add ability to save profile with app layout memory via hotkey (new profile or overwrite current profile) needs to have confirmation modal. Also ability to set hotkeys to launch profiles (both are important)
- launch free and paid tiers, free has access to everythind but only three profiles, paid has access to everything and unlimited profiles.
- App should be downloaded as free tier from website. if the users pays they get a product license they can use to convert their product to paid tier
- App profiles can be set to trigger when certain apps or tabs are opened. For example, user sets Development profile to open when they open VSCode so next time they launch VSCode and flowswitch is current it gives confirmation popup saying "Launch development profile, Yes No or Disable this automation" something along those lines.
- add ability to manually add exe files to apps section
- spam click dragging in the monitor layout makes the app freeze. Need to prevent freezing and allow this behavior by optimizing the drag experience
- Dynamic layout name is not easily understandable. Instead dynamically change the name in the dropdown to the cuurent layout (1 app will say fullscreen)
- If you edit and drag apps to minimized apps on non primary monitor it lawys goes to monitor 1
- allow opening inspector by clicking on app in minimized app in edit mode
- Make launch profile button text centered for non-hotkey profiles
- Allow custom layouts, Free option in layout dropdown where user can drag whereever they want and resize apps as they please. make sure the mini title bar on app windows resizes well at small sizes
- users report app is blurry for users on first launch
- add constraints on launching too many apps, apps that compete
- Some apps are found in apps tab but are not launchable (battle.net launcher did that)
- Other users the have apps on other drives than C drive report no icons or other issues
- All users to launch apps from apps tab/inspector to test
- Some app windows cannot be small enough to fit in certain window constraints, we need to be aware of that. apps have minimum sizes for windows that we might want to detect
- Make it more obvious when user is in view mode vs edit mode. users are forgetting about the two modes. user a segmented control maybe.
- move launch status feedback to below the launch button
- Allow users to click anywhere on the entire app card in the sidebar to initiate dragging instead of just the icon. Clcing once anywhere can still open the inspector
- Add a tutorial on first launch
- Allowi dragging by the full app card instead of icon only
- right click context menu on apps for quick commands
- Add undo/redo/copy/paste and shortcuts
- Hide from catalog should be red by default in three dot menu for apps instead of just on hover

## Reviewed / Formalized

This section converts raw inbox notes into a normalized product backlog.
It groups related ideas, removes duplication, and assigns priority, scope, and readiness.

### Evaluation Snapshot

- Strongest value concentration is in launch reliability/feedback, app discovery quality, and layout editor usability.
- Several ideas overlap and should be treated as single initiatives (for example launch progress + launch modal + completion feedback).
- A few items are high upside but low readiness and should remain exploratory (AI workspace generation, mobile companion).
- UI polish requests are useful but should follow core reliability and workflow completion work.
- **Batch B themes (2026-04-19):** primary-action clarity in the shell (header/launch CTA), design-system consistency for shared controls, MLP tooltip hygiene, ultrawide/template ergonomics, and **evaluate-don’t-commit** items: OS-level taskbar pin state per profile, time/rule-based profile gating, and system-load-aware launch (telemetry cost, accuracy, and user trust).
- **Batch C themes (2026-04-27):** **reliability bugs** (layout drag freeze, wrong monitor when targeting minimized windows on secondary displays), **discovery gaps** (manual `.exe`, list vs launchable, non–C: installs, test-launch from catalog), **editor depth** (undo/redo, freeform layout mode, clearer preset naming, minimized-tile inspector), **shell polish** (launch status placement, launch label alignment, view/edit affordance, first-run tutorial), **catalog hygiene** (hide apps + show hidden filter, context menus, destructive-menu emphasis), **commercialization** (freemium profile caps + license upgrade—needs product/legal design), and **evaluate** tracks (foreground-triggered profile offers, OS minimum window sizes).

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
  - optional user-supplied executable paths when catalog enumeration misses an install
  - distinguish “listed for reference” vs “reliably launchable” (launcher indirection, elevation, working directory—e.g. Battle.net-style entries)
  - “test launch” (or open file location) from Apps tab / inspector without mutating a profile
  - resilient icon and path resolution for apps installed on volumes other than the system drive
- Merged inbox items: missing apps, hide non-apps, missing icons, exclude apps, favorites/tags; Batch C manual `.exe`, list-but-not-launchable, other-drive icons, launch-from-inspector testing.
- Done when: discovery feels trustworthy, searchable list is clean, most apps show valid icons, and users can verify launch behavior before committing an app to a profile.

1. Safe launch guardrails for large profiles

- Problem: very large profiles can degrade reliability and UX.
- Scope:
  - define soft threshold warning and hard threshold constraints
  - explain expected launch duration/risk before run
  - optional launch sequencing support for dependency-sensitive apps
- Merged inbox items: constraints for too many apps, profile launch order, Batch C “competing apps” guidance (soft warnings / copy where overlaps exist with singleton or resource-heavy launch patterns).
- Done when: users are warned/protected before risky launches and can intentionally choose launch order.

1. Critical layout-editor responsiveness and first-run shell clarity

- Problem: fast repeated drag operations in the monitor layout editor can freeze the app; some users report a blurry UI on first launch—both damage trust before core workflows land.
- Scope:
  - harden drag/drop and placement update paths (coalesce work, avoid main-thread stalls, cap redundant layout passes) so rapid input cannot wedge the renderer
  - investigate Windows DPI / display scaling and Electron zoom paths for first-run blur; validate `devicePixelRatio` and font/asset scaling assumptions
- Merged inbox items: Batch C spam-click drag freeze, first-launch blur.
- Done when: layout editing stays responsive under fast pointer input and first-run chrome is sharp on common scaling configurations.

#### Next (P1: usability and workflow acceleration)

1. Layout preview status semantics

- Problem: monitor layout preview does not clearly communicate runtime state.
- Scope:
  - per-window status styling in preview (not launched, launched, minimized, failed, needs confirmation)
  - keep visual system minimal to avoid clutter
  - fix or remove ambiguous “content bubble” tooltips on hover in monitor layout (clipped layout, redundant copy, or wrong layering)
- Merged inbox items: Batch B MLP tooltip/bubble behavior.
- Done when: runtime state is understandable from preview at a glance and hover affordances do not fight the layout editor.

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
  - dedicated hotkey workflow to snapshot current window layout into a profile (create new vs overwrite active) with a confirmation modal and clear undo/discard path
  - explicit "run on startup" option per profile
  - inline rename for active profile from header (click name, edit in place, blur/click-out to save) with validation and undo-safe behavior
- Merged inbox items: create from anywhere, taskbar switching, hotkeys, startup run, GeForce-style quick switcher, Batch B header inline rename; Batch C layout-memory hotkey + modal, profile launch hotkeys (reinforced).
- Done when: launching/switching profiles requires minimal navigation friction, renaming a profile is obvious and low-risk, and power users can bind both “launch profile” and “save layout to profile” without hunting through menus.

1. Layout editor ergonomics

- Problem: editing is click-precision heavy and some controls are awkward.
- Scope:
  - drag from full app card (not icon only); single click on card still opens inspector/details
  - optional "+" affordance for empty slots in edit mode
  - support vertically stacked monitor arrangements
  - allow monitor tile size tuning in preview
  - presets/templates for common geometries (including ultrawide) where they reduce setup time without constraining power users
  - human-readable, context-aware names for the active layout preset in the selector (for example single-app tiles labeled as fullscreen rather than opaque internal labels)
  - correct hit-testing when dropping onto minimized window representations on non-primary monitors (must not silently route to primary)
  - open inspector by activating a minimized app tile while in edit mode
  - editor history: undo/redo and copy/paste of placement state with keyboard shortcuts
  - optional “freeform / custom” layout mode: less grid-bound drag and resize with MLP chrome and in-preview title bars that remain usable at small sizes
  - fix monitor-layout dropdown click interception bug
  - reorder hover window controls to native order
- Merged inbox items: Batch B ultrawide presets support; Batch C full-card drag, dynamic layout naming, minimized-on-secondary monitor bug, minimized-tile inspector, undo/redo shortcuts, custom layout mode.
- Done when: common edit operations are easy, predictable, and low-friction.

1. Responsive UI behavior at smaller window sizes

- Problem: non-fullscreen usage is common, but responsiveness is currently weak.
- Scope:
  - improve narrow-width layout behavior
  - make icon sizing adaptive with window resize
  - optimize monitor-preview space utilization
  - support easy sidebar hide/show controls
  - allow close-right-sidebar by clicking outside selected app context
  - group primary launch status feedback directly under the Launch control for clearer cause-and-effect reading order
  - center Launch button label when no hotkey hint is shown, if layout spec calls for symmetry
- Merged inbox items: Batch C launch status below launch button, launch label centering for non-hotkey profiles.
- Done when: app remains readable, usable, and visually consistent at reduced sizes.

1. Profile list at-a-glance composition

- Problem: aggregate counts (“N monitors / apps / tabs”) make it hard to recognize which apps a profile contains without opening it.
- Scope:
  - compact strip or cluster of app icons on profile cards with overflow + tooltip or popover for the remainder
- Merged inbox items: Batch C profile cards show icons instead of counts-only summary.
- Done when: users can scan the profile list and distinguish common profiles by visible app composition.

1. Apps catalog organization and quick commands

- Problem: long-lived catalogs accumulate entries users never launch via FlowSwitch; high-impact actions need predictable emphasis.
- Scope:
  - per-app “hide from FlowSwitch catalog” with a catalog filter to temporarily show hidden rows for recovery
  - right-click context menu on catalog rows for frequent commands (hide/show, favorite when available, reveal in Explorer, test launch)
  - persistent destructive styling for “hide from catalog” inside overflow menus (not red-only-on-hover)
- Merged inbox items: Batch C hide apps + filter, context menu quick commands, hide-from-catalog default red styling.
- Done when: users can curate the catalog quickly and rarely mis-tap destructive actions.

1. Edit vs view affordance and first-run guidance

- Problem: users forget which mode they are in; first sessions lack orientation.
- Scope:
  - high-salience mode control (for example segmented View | Edit) aligned to the existing edit/view state machine
  - short first-run walkthrough or checklist covering modes, saving, and launching
- Merged inbox items: Batch C segmented control for modes, first-launch tutorial.
- Done when: qualitative feedback shows fewer “stuck in wrong mode” incidents and new users complete a first successful launch without external docs.

#### Later (P2: valuable extensions after core workflow maturity)

1. Launch policy controls for existing/open apps

- Scope:
  - global/profile policy: minimize all, close all, end task, ignore, etc.
  - optional "close all apps in profile" command
- Done when: users can consistently define conflict behavior with existing windows/processes.

1. Profile autosave and timed/scheduled launch

- Scope:
  - periodic layout autosave with profile overwrite policy
  - manual "resave current layout" shortcut (align UX with Batch C hotkey snapshot flows: create vs overwrite, confirmation modal, and optional undo)
  - schedule launch at user-defined times
- Merged inbox items: Batch C overlaps with manual layout-memory hotkey; keep one coherent autosave / snapshot story across P1 hotkeys and P2 periodic autosave.
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
  - evaluate primary launch CTA clarity: larger launch control, optional dynamic label (for example “Launch [active profile]”), and whether dedicating more header real estate to launch improves discoverability without hiding secondary navigation
- Merged inbox items: Batch B “whole header as launch” / oversized launch / dynamic launch label ideas (design spike, not a mandate to implement all variants).
- Done when: top-level controls are discoverable with less visual clutter and the dominant action (launch) is unmistakable.

1. Access rules and distraction boundaries (evaluate)

- Scope:
  - time windows, calendars, or simple rules that limit which profiles can run or which surfaces stay available
  - “kids / focus” style modes are attractive but need threat model, bypass resistance, and support burden definition
- Merged inbox items: Batch B restrict profiles by time/criteria.
- Recommendation: **evaluate** with user research and platform constraints before a roadmap slot; may overlap with future policy/automation work.

1. Visual style enhancements (defer until workflow polish is stable)

- Scope:
  - icon refresh exploration (light gradient/cloud contour concepts)
  - optional subtle dot-grid background for monitor layout preview and related “workspace” chrome (for example floating sidebars / canvas framing in the style of tools with dotted canvas chrome) — prototype for legibility and performance impact
  - shared design tokens and component patterns for repeated UI (dropdowns, modals, settings panels) so styling stays consistent as features grow
- Merged inbox items: Batch B dot-grid / dotted-canvas workspace feel, Batch B standardize styling across dropdowns and settings modals.
- Done when: visual updates reinforce clarity without harming contrast/performance and new screens reuse the same interaction/visual language.

1. OS shell integration: taskbar pins per profile (evaluate)

- Scope:
  - changing Windows taskbar pins per profile is compelling but tightly coupled to OS behavior, undocumented edges, and multi-user expectations
- Merged inbox items: Batch B taskbar pin changes per profile.
- Recommendation: **evaluate** feasibility (APIs, stability, restore on switch) before committing; treat as R&D unless a viable approach is proven.

1. System health signals for launch pacing and warnings (evaluate)

- Scope:
  - surface CPU/memory pressure (and optionally temperature where reliable) to warn before heavy launches or adapt concurrency
  - define what “adapt” means without surprising users (never silently skip apps)
- Merged inbox items: Batch B machine load / temps / Task Manager–style signals.
- Recommendation: **evaluate** signal quality on Windows, privacy/copy, and overlap with existing launch guardrails; implement only if warnings are trustworthy and actionable.

1. Tiering, licensing, and download alignment (evaluate)

- Scope:
  - ship a single downloadable build aligned to a free tier (example intake: full feature surface with a small profile-count cap such as three profiles)
  - paid tier removes caps (for example unlimited profiles) with terms TBD
  - in-app activation via product license purchased outside the binary (website checkout → key or account token)
- Merged inbox items: Batch C free vs paid tiers, website free download + paid license conversion.
- Recommendation: **evaluate** with product, support, and legal before an engineering slot: entitlement storage, revocation, offline use, upgrade/downgrade, and messaging so users are never surprised by locked profiles.

1. Profile offers when external apps or tabs enter focus (evaluate)

- Scope:
  - user-defined rules that map foreground app or browser tab signals to “offer this profile” prompts
  - tri-state confirmation: launch now / dismiss once / disable this rule
  - guardrails for false positives, rate limiting, and explicit opt-in per target app
- Merged inbox items: Batch C “open VS Code → suggest Development profile” style automation.
- Recommendation: **evaluate** detection fidelity, privacy copy, and overlap with future policy/automation; do not ship silent auto-launch without strong consent UX.

1. OS minimum window sizes in layout validation (evaluate)

- Scope:
  - detect or learn per-app minimum window dimensions where Windows APIs and sampling allow
  - surface editor warnings and launch-time placement feedback when tiles are smaller than minimums
- Merged inbox items: Batch C apps that cannot shrink enough for chosen tiles.
- Recommendation: **evaluate** feasibility and tie to placement-verification work; partial detection may still beat silent failure.

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

1. Launch visibility/control (Now Item 1)
2. Critical layout-editor responsiveness, minimized-target monitor correctness, and first-run sharpness (Now Item 4)—pair with any shared renderer hit-testing work in the layout editor
3. App discovery completeness/hygiene (Now Item 2), including manual executables, other-drive installs, and list-vs-launchable clarity
4. Launch guardrails + sequence controls (Now Item 3)
5. Layout preview status semantics + reapply layout without relaunch (Next), including MLP tooltip fix
6. Profile access acceleration + editor ergonomics (Next Items 6 + 7), plus profile-card composition, catalog quick commands/hiding, and mode/onboarding passes (Batch C Next expansions)
7. Responsive UI pass (Next Item 8)
8. Later-phase policy, automation, expanded targets, IA (including launch CTA evaluation), access-rule spike, visual system pass, and OS/telemetry evaluation items once core UX is stable
9. Run evaluate-don’t-commit tracks as time-boxed spikes in parallel where helpful: access rules, taskbar pins per profile, system health signals for launch, **Batch C** foreground-trigger profile offers, minimum-window validation, and freemium/licensing
10. Incubator exploration only when foundation is stable (AI workspace blueprints, mobile companion)

### Notes for Future Spec Work

- Convert each "Now" item into a dedicated design spec before implementation.
- For each spec, define explicit acceptance criteria and non-goals to avoid scope creep.
- Track dependencies between launch pipeline changes and renderer status UX so sequencing stays realistic.
- For Batch B and Batch C **evaluate** items, capture a short decision memo (feasibility, risks, user value) before promoting to P1/P2.


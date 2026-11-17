# AfriCore Application UI Implementation Standard

This standard applies to future application checkpoints and shared UI corrections. The current app catalog, server authorization, domain services and existing component system remain authoritative.

## Navigation and app context

- Home and Office retain the normal workspace sidebar and its authorized destinations.
- Opening an installed app enters an immersive, full-width workspace. Do not leave an icon rail, empty gutter or persistent global sidebar behind.
- Derive immersive state from the current authorized app catalog entry and URL. Support refresh, direct links, browser Back/Forward, section changes, company changes, install changes and the personal/developer workspaces the app supports.
- Keep one compact app header. Provide an accessible workspace-navigation button, app launcher, current app/section, company/workspace switcher and the existing account/environment controls.
- Open global navigation as an overlay. Support Escape, backdrop dismissal, focus entry/restoration, keyboard use, and closing on destination selection. Never reserve page width for the open drawer.
- Sections belonging to an installed app stay inside that app. Explicit independent-service destinations keep their service routes and authority.
- Switching workspace, company, environment, app or section must not show records from the previous scope while the new scoped request is pending. Keep current server membership and authorization checks on every data request.

## Screenshot-first implementation

Treat every supplied reference image as a screen specification. Before implementation, inspect each image at full resolution and record its dimensions and viewport. Measure the major geometry: header and toolbar heights, content bounds, columns, field alignment, table rows, controls, margins, spacing, typography, borders, backgrounds, tabs, menus and dialogs.

Build the arrangement with AfriCore's own components, icons, styles and data contracts. Preserve the reference's hierarchy and density; do not replace operational forms, Kanban boards, tables, reporting controls or compact dialogs with generic dashboards or large decorative cards. Reuse shared primitives where their behavior and geometry fit. Keep application-owned navigation and operational content distinct.

For each reference screen, capture the running AfriCore screen at a comparable viewport. Compare reference and implementation side by side; note meaningful structural differences, fix them, and recapture. Record which screens were actually captured, viewport sizes, remaining differences and any unavailable browser/authentication gate. Source review, unit tests and static markup do not count as visual comparison or pixel-accuracy evidence.

## Redundancy, truth and accessibility

- Keep one clear app identity and one effective navigation path. Move installation/service detail into contextual information or settings instead of placing repeated service and related-app panels above each operational screen.
- Keep warnings beside the action or data they qualify: permissions, inactive services, sandbox/simulated states, partial coverage, financial definitions, verification limits, unsaved edits and destructive actions.
- Do not fabricate counts, financial outcomes, history, statuses, activity or integrations to fill a layout. Use the existing authoritative service and state its coverage limits.
- Preserve current permission checks, tenant/company/environment scope, optimistic versions, idempotency and domain ownership. UI convenience must not broaden server authority.
- Use semantic controls, labels and headings; visible keyboard focus; accessible names for icon-only buttons; dialog focus management; Escape/backdrop behavior; and keyboard alternatives for pointer-only interactions.
- At narrow widths, retain readable 16px form text where needed to prevent mobile zoom, touch-sized controls and contained horizontal scrolling for genuinely wide tables/boards.

## Acceptance evidence

Before calling a checkpoint complete, report separately:

1. Source baseline and changed scope.
2. Functional workflows and server-authority boundaries.
3. Automated checks, exact results and any skipped coverage.
4. Visual reference-to-running-screen comparisons actually performed, including viewports and unresolved differences.
5. Accessibility, responsive, permission, workspace-switching and manual acceptance that remain outstanding.
6. Unsupported or intentionally unimplemented capabilities.

Never infer authenticated browser, physical-device, provider or founder acceptance from a successful build or source-level test. Keep project progress and implementation-status records consistent with the evidence. Do not commit, deploy, migrate or activate external services unless the task explicitly authorizes that action.

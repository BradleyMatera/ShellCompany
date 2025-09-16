# ASK — Make the Whole Lifecycle Real

Brief → Clarify → Plan → Execute → Review → CEO Sign-off, with working Agent Environments and truthful Ongoing Projects

## Problem (current build)

- Board Room auto-finishes with a two-task pipeline (Alex → Nova) regardless of intent. No manager brief, no clarifications, no review, no CEO gate, no visible “thinking”.
- Agent Environment (Workers → click agent)
  - CSS/layout broken (editor overlaps, cramped left tree).
  - Chat is cosmetic (messages don’t reflect real agent context/tasks/workspace; no provenance to the same workflow).
  - Files visible but not truly editable/traceable to workflow; save doesn’t update lineage/events.
- Ongoing Projects shows random workflow IDs with 0 files / 0 artifacts (no persistence wiring) — cannot reopen, audit, or download anything.
- Cross-tab truth is missing: Console logs, Workers states, and Ongoing Projects don’t agree on tasks, artifacts, or progress.

## Objectives

1. Manager-led, auditable workflow that changes by directive intent (not hardcoded to Alex → Nova), with clarifying questions, a written Manager Brief, scheduled specialist tasks, a Manager Review, and final CEO approval before completion.
2. Agent Environment that is real: stable CSS, file CRUD that writes to disk + DB, and chat tied to the same workflow/agent/tools with streaming logs.
3. Ongoing Projects that tells the truth: every workflow shows files, artifacts, lineage, review notes, and status; survives refresh/restart and links back to agent workspaces.

## Functional Requirements

### A) Workflow Orchestrator & Data

- Manager selection by intent:
  - Map intents to managers: Sage = DevOps/docs, Alex = PM/product, Zephyr = backend, Pixel = design, Nova = frontend. If directive explicitly names an agent (e.g., "have Sage…"), treat that as requested manager.
- Manager Brief:
  - Create a `manager_brief` task that results in `MANAGER_BRIEF.md` authored by the manager, containing: understanding, assumptions, risks, plan (numbered tasks with owners), clarifying questions, success criteria.
  - Save the brief to disk in the manager’s workspace and persist in DB with lineage: createdBy, workflowId, SHA, timestamps.
- Clarification Gate:
  - If filename/location/tone/length not explicit, BriefManager must produce clarifier questions and hold specialist tasks until the brief is approved (or explicitly proceed-without-answers chosen by manager).
- Scheduling After Approval:
  - Implement `schedulePendingAfterApproval()` to:
    1. Append `manager_review` task if missing.
    2. Persist `manager_review`.
    3. Recompute `workflow.progress.total` to include scheduled specialist tasks + `manager_review`.
- Task semantics:
  - `executeTask()` must support `manager_brief` (create_file behavior) and `manager_review` (lightweight review; writes `MANAGER_REVIEW.md`).
  - No undefined executor commands — all tasks map to explicit, testable behaviors.
- Artifact lineage:
  - Artifacts must include metadata: "Created by {specialist}, requested by {manager}, as per Brief v{n}".
- CEO approval gate:
  - Workflow final completion requires: all tasks done, `manager_review` done, and `metadata.ceoApproved === true`.
  - New endpoints:
    - POST `/api/workflows/:id/brief/approve` and `/api/workflows/:id/brief/reject`
    - POST `/api/workflows/:id/approve` and `/api/workflows/:id/reject`
- Persistence:
  - Persist brief content, clarifiers/Q&A, scheduled task list, assignments, task states, artifact records, review notes, CEO approval flag.
- Duplicate-artifact reconciliation:
  - On unique SHA collisions, link to existing artifact entry instead of failing.
- Socket safety:
  - Socket emits must be null-safe for tests/headless (no throws when sockets absent).

### B) Board Room (UI/UX)

- Show the chosen Manager, Manager Brief (expand to read), Clarifying Questions + inline answers, Approve Brief CTA, and later Approve Final Delivery CTA.
- Pipeline visualization must show: `manager_brief` → specialist tasks → `manager_review` → CEO approval.
- Message stream prefixes: `[Manager:Sage]`, `[Specialist:Nova]`, `[Review:Sage]`, `[CEO]` with the same `workflowId`.

### C) Agent Environment (Workers → click agent)

- CSS/layout:
  - Left: file tree (scrollable).
  - Center: editor/preview with tabs, toolbar (Edit/Save/Cancel, Download, Open in Finder).
  - Right: Chat panel (sticky header + streaming body).
- File CRUD:
  - Open, edit, save writes to disk and DB, refreshes SHA, appends a lineage event ("edited by {actor}").
- Chat:
  - Bound to `{workflowId, agentName}`; uses ProviderMonitor’s active model; streams messages to Console with matching workflow and agent tags.
  - Quick Actions: "Ask about this file", "Why was this created?", "Generate summary of artifacts", "Propose changes" — results persist as chat + optional artifacts.

### D) Ongoing Projects (Projects tab)

- Card per workflow with: title (first sentence of directive), `workflowId`, status badge, manager, agents, counts, created/updated timestamps, and Artifacts (open/download inline).
- Drill-in page shows full chain: Brief → Q&A → Task list & states → Artifacts with lineage → Review note → CEO decision.
- Search & filters: Active / Completed / Waiting for CEO / Failed; search by `workflowId` and by filename.
- Deep links: open artifact in Agent Environment and Console at the right position.

## Acceptance Criteria (all must pass)

1. Manager chosen by intent:
   - Input: "have Sage create an about me and put it in an md document, I will review it later"
   - Result: Manager = Sage (not Alex). `MANAGER_BRIEF.md` appears in Board Room & Ongoing Projects within 2s.
2. Clarify before commit:
   - If filename/tone/length missing, system posts at least one clarifier; specialist tasks remain Pending until answer + Approve Brief.
3. Correct scheduling math:
   - After brief approval, `workflow.progress.total` includes scheduled specialist tasks + `manager_review`.
   - `manager_review` is present, visible, and persisted.
4. Specialist artifacts + lineage:
   - Nova (or appropriate specialist) creates `ABOUT_ME.md` in their workspace.
   - Ongoing Projects shows lineage: "Created by Nova • Requested by Sage • Workflow {id} • timestamp".
5. Review then CEO approval gating:
   - Workflow does not reach 100% until `manager_review` completes and the CEO clicks Approve Final Delivery. Only then status = Completed.
6. Agent Environment is real:
   - CSS stable. File edits persist to disk and DB; lineage updates.
   - Chat issues a real provider call bound to `{workflowId, agent}`, actions appear in Console with matching tags.
7. Cross-tab truth:
   - Same `workflowId` appears in Board Room, Console, Workers, and Ongoing Projects with matching task/percent/artifact counts.
8. Uniqueness across directives:
   - Example directives produce different manager selections, plans, and artifacts as described (Alex vs Sage managers, different specialists).
9. Resilience:
   - No socket crashes in headless tests.
   - Duplicate SHA reconciliation links instead of failing.
   - Page refresh and server restart preserve all workflow data.

## Test Protocol (run exactly)

### Manual E2E (Action Browser)
1. Run 1 (Docs/DevOps)
   - Submit Sage directive above.
   - Verify: Brief visible → clarifiers → Approve Brief → Nova creates `ABOUT_ME.md` → `MANAGER_REVIEW.md` generated → Approve Final Delivery → status Completed.
   - Open `ABOUT_ME.md` from Workers (Nova) and Ongoing Projects, edit and save; see lineage update.
2. Run 2 (Creative/Product)
   - Submit movie-pitch directive.
   - Verify: Alex manages; Pixel & Zephyr tasks appear; artifacts differ from Run 1.
3. Run 3 (DevOps)
   - Submit CI setup directive.
   - Verify: Sage manages; Zephyr runs pipelines; Nova only if UI change requested.
4. Cross-tab checks
   - For each run, check Board Room, Console (role-tagged streaming), Workers (Managing/Busy states + artifact counters), Ongoing Projects (full chain & downloads).
   - Restart server; confirm all history intact.

### Automated
- Integration: `server/test_manager_flow_integration.js`
  - Asserts: brief created → approve brief → pending scheduled → `manager_review` appended → specialist artifact exists → CEO approval required for completion → Completed on CEO approval.
  - Verifies `progress.total` includes review and tasks were blocked pre-approval.
- API: `supertest` tests for:
  - POST `/api/workflows` → 201 (returns workflowId)
  - POST `/api/workflows/:id/brief/approve` → 200 and schedules pending + review
  - POST `/api/workflows/:id/approve` → 200 and completes only if `manager_review` done
- UI: Playwright
  - Expand Brief, answer clarifier, approve, watch pipeline advance, open artifact, edit & save, verify lineage, approve final.

## Implementation Notes (to avoid rework)

- Do not auto-complete workflows. Enforce the gates.
- Use ProviderMonitor’s active model for chat; bind threads to `workflowId`.
- Persist preferred models and workflow state; do not show placeholders in Engine Status when agents are chatting/editing.
- On file saves: update artifact/asset DB rows, refresh SHA, emit `artifact_changed` events UI listens to.

## Deliverables

- Updated orchestrator & API (brief approval, CEO approval, scheduling math, review task).
- Fixed Agent Environment (CSS, chat wiring, file CRUD with lineage).
- Ongoing Projects truth view (cards + drill-in with chain + download).
- Tests (integration + API + Playwright) and a short demo script that walks through Runs 1–3.

## UI Fit & Finish (must-ship polish)

### Global
- Consistent type scale (12/14/16/20/24/32) and 8-pt spacing grid. Line-height 1.4–1.6.
- Dark mode contrast meeting WCAG AA (contrast ratios ≥ 4.5:1 for body text).
- Visible keyboard focus ring on interactive elements; distinct hover/active states.
- Skeleton loaders for lists/cards/editors; helpful empty states and CTAs.
- Toasts & errors: success (green), warning (amber), error (red) with concise copy and “View logs” deep link.
- Virtualize long lists; debounce refreshes (≥300ms).

### Board Room
- Project Brief header with directive snippet and copy workflow ID.
- Manager card (avatar, role, "Why selected?" tooltip).
- Collapsible Manager Brief panel (Markdown, "Open in Agent Environment").
- Pipeline steps with owner avatar, start/end time, and live percent; CTAs: "Approve Brief", "Request Changes", "Approve Final Delivery".

### Console
- Role-tagged stream: prefixes `[Manager:Sage]`, `[Specialist:Nova]`, `[Review:Sage]`, `[CEO]`, `[System]`.
- Filter chips per role; Pause/Resume auto-scroll; "Copy log" button.
- Deep-link chips to artifacts or Workers/Projects.

### Agent Environment (Workers → click agent)
- Left: file tree (search, collapse/expand).
- Center: editor/preview tabs with toolbar and actions (Edit/Save/Cancel, Download, Open in Finder).
- Right: chat panel with sticky input; messages show model chip, tokens, latency.
- Editor: optimistic save + conflict handling, code highlighting, diff view for unsaved changes.
- On save: update SHA + lineage event; show toast "Saved • sha:abcd123".
- File ops: New, Rename, Delete (confirm), Move (drag-drop); preview-only for large files (>1.5MB).
- Quick Actions: "Explain this file", "Propose refactor" — persist results as chat + artifact if needed.
- Status strip: Agent status, queue length, last heartbeat.

### Ongoing Projects
- Grid cards with manager avatar, agents mini-avatars, counts, status badge.
- Filters: Status (Active/Waiting for CEO/Completed/Failed), text search, date range.
- Detail view: full chain and deep links to Agent Environment and Console.

### Engine Status
- Model dropdown per provider (persisted), last status code + latency; View logs opens filtered Console.

### Accessibility & Input
- Full keyboard nav; ARIA roles for tablists/trees/dialogs; toasts announced to screen readers.

## UI Acceptance Criteria (additive)

1. No overflow/overlap in Agent Environment; editor never covers chat or tree at ≥1200px width.
2. File edit cycle: open → edit → save → lineage event appears in Ongoing Projects within 2s.
3. Chat provenance: messages show model + latency and appear in Console with same `workflowId` and role tag.
4. Board Room gating UX: brief cannot be approved until at least one clarifier is answered or "Proceed without answers" explicitly chosen (with confirmation).
5. Persistent deep links: copying a workflow link opens detail view with Brief and Artifacts loaded after refresh/server restart.
6. Performance: initial render ≤ 1.0s on Engine Status, ≤ 1.5s on Projects page with 50 cards (local dev machine).

## Deliverables (UI)

- Updated React components for Board Room, Console, Agent Environment, Ongoing Projects, and Engine Status per above.
- Shared Design Tokens (spacing, colors, shadows) and Toast/Tooltip primitives.
- Playwright scripts covering: brief approval flow, file edit/save lineage, chat model switcher, and deep links.

## Definition of Done

I can run the three directives end-to-end in the live app, with a stable, clean UI that:
- shows a manager’s real brief & clarifiers,
- lets me approve and watch the pipeline advance,
- lets me open/edit artifacts in a polished editor with lineage,
- streams role-tagged logs,
- and only completes after manager review and my final approval—
with the same `workflowId` and data consistent across Board Room, Console, Workers, and Ongoing Projects, even after refresh/restart.

---

## Next steps (recommended separate tickets)
1. Implement orchestrator gates & DB fields (`managerBrief`, `pendingAfterApproval`, `metadata.ceoApproved`) + API endpoints.
2. Wire BriefManager to create persistent `MANAGER_BRIEF.md` and clarifiers.
3. Implement file CRUD & lineage wiring in Agent Environment; add file save → DB update → socket emit.
4. Add `supertest` API tests and `Playwright` UI tests, plus CI migration steps.
5. UI polish sprint for Agent Environment/Board Room/Projects per the Fit & Finish list.

---

Paste this file into tickets, PR descriptions, or roadmap documents as needed.

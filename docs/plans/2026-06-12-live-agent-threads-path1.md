# Live Agent Threads Path 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add page-local live `@agent` prompting for the open notebook, backed by a real external-agent task/reply queue that existing paired agents can poll and answer.

**Architecture:** Keep the existing shared canvas as the notebook source of truth. Add a lightweight live-session layer in the editor that rewrites tagged prompt lines into structured prompt records, publishes per-agent tasks into the existing `ezwrite_agent_events` queue, polls for reply events, and renders reply lines as editable agent blocks. Extend the agent API/MCP surface so already-paired external agents can claim queued tasks and submit replies back without any new auth model.

**Tech Stack:** React, TypeScript, existing contentEditable editor line model, Supabase REST tables (`ezwrite_agent_pairings`, `ezwrite_agent_events`, `ezwrite_agent_canvas`), existing `/api/agent` + `/api/mcp`.

---

### Task 1: Lock the live-thread parsing contract in tests

**Files:**
- Create: `src/lib/agent-live-session.ts`
- Create: `src/lib/agent-live-session.test.ts`
- Test: `src/lib/agent-live-session.test.ts`

**Step 1: Write the failing tests**

Cover:
- extracting active-agent mentions from arbitrary text
- turning a raw prompt line into a structured stored prompt line
- encoding/decoding structured reply lines
- grouping multiline reply lines into one logical agent block
- preventing the same exact prompt from re-queueing twice

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/agent-live-session.test.ts`
Expected: FAIL because the module does not exist yet.

**Step 3: Write minimal implementation**

Add a pure helper module for:
- agent mention parsing
- raw storage line encoding/decoding
- task fingerprinting / duplicate protection
- reply block grouping metadata

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/agent-live-session.test.ts`
Expected: PASS

### Task 2: Lock editor rendering for agent prompt + reply lines

**Files:**
- Modify: `src/components/writing-helpers.ts`
- Modify: `src/components/editor-behavior.test.ts`
- Test: `src/components/editor-behavior.test.ts`

**Step 1: Write the failing tests**

Add tests that assert:
- `contentToHTML()` renders structured prompt lines as prompt rows
- `contentToHTML()` renders structured reply lines as agent reply rows
- `extractContent()` round-trips edited prompt/reply lines back into structured storage lines

**Step 2: Run test to verify it fails**

Run: `node --test src/components/editor-behavior.test.ts`
Expected: FAIL on missing agent prompt / reply support.

**Step 3: Write minimal implementation**

Extend the line type system with prompt/reply variants and preserve editability through `extractContent()`.

**Step 4: Run test to verify it passes**

Run: `node --test src/components/editor-behavior.test.ts`
Expected: PASS

### Task 3: Add live-session toggles and active-agent filtering in the popup

**Files:**
- Modify: `src/components/AgentPairingSection.tsx`
- Modify: `src/lib/agent-pairing.test.ts`
- Create: `src/lib/agent-live-session-store.ts`
- Test: `src/lib/agent-pairing.test.ts`

**Step 1: Write the failing tests**

Add tests that assert:
- each active pairing row exposes an on/off toggle next to revoke
- the UI copy explains that toggled-on agents are available to `@`
- a small local session store can list only enabled agents

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/agent-pairing.test.ts`
Expected: FAIL on missing toggle UI/state.

**Step 3: Write minimal implementation**

Persist enabled live-session agents locally and thread the filtered active list out of the popup.

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/agent-pairing.test.ts`
Expected: PASS

### Task 4: Add the `@agent` picker to the main editor

**Files:**
- Create: `src/components/AgentMentionPopup.tsx`
- Modify: `src/components/WritingInterface.tsx`
- Modify: `src/components/editor-behavior.test.ts`
- Test: `src/components/editor-behavior.test.ts`

**Step 1: Write the failing tests**

Add tests that assert:
- the main editor tracks an `@` popup state alongside slash popup state
- only currently enabled live-session agents appear in the picker
- selecting an agent inserts the chosen label into the current line

**Step 2: Run test to verify it fails**

Run: `node --test src/components/editor-behavior.test.ts`
Expected: FAIL on missing popup wiring.

**Step 3: Write minimal implementation**

Reuse the slash-popup positioning pattern for agent mentions and close the popup when there are no enabled agents or the token no longer matches.

**Step 4: Run test to verify it passes**

Run: `node --test src/components/editor-behavior.test.ts`
Expected: PASS

### Task 5: Publish prompt tasks to the external-agent queue

**Files:**
- Modify: `src/components/WritingInterface.tsx`
- Modify: `src/lib/agent-relay.ts`
- Modify: `src/lib/agent-live-session.ts`
- Test: `src/lib/agent-live-session.test.ts`

**Step 1: Write the failing tests**

Add tests for:
- converting a visible `@agent` prompt into per-agent queue events
- only watching the open notebook
- only queueing newly-created prompts while live mode is on
- inserting pending placeholder reply lines under the prompt

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/agent-live-session.test.ts`
Expected: FAIL until queue payload creation and duplicate protection exist.

**Step 3: Write minimal implementation**

When the live session is on:
- detect raw tagged prompt lines
- rewrite them into structured prompt lines
- insert pending reply placeholders
- publish one queue event per targeted enabled agent

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/agent-live-session.test.ts`
Expected: PASS

### Task 6: Extend `/api/agent` and `/api/mcp` so external agents can claim tasks and submit replies

**Files:**
- Modify: `lib/agent-upstream.ts`
- Modify: `lib/agent-upstream.test.ts`
- Modify: `lib/agent-mcp.ts`
- Modify: `lib/agent-mcp.test.ts`
- Test: `lib/agent-upstream.test.ts`, `lib/agent-mcp.test.ts`

**Step 1: Write the failing tests**

Cover:
- claim-next-task returns only tasks targeted at the caller’s pairing label
- scoped pairings only see the open/in-scope notebook tasks
- replying to a task appends a reply event payload instead of mutating canvas directly
- MCP exposes matching tools for claim/reply

**Step 2: Run test to verify it fails**

Run: `node --test lib/agent-upstream.test.ts lib/agent-mcp.test.ts`
Expected: FAIL on missing actions/tools.

**Step 3: Write minimal implementation**

Add agent actions/tools such as:
- task claim/poll
- reply submission
- optional retry/ack hooks if needed for duplicate safety

Use the existing `ezwrite_agent_events` table instead of introducing a new auth/channel surface.

**Step 4: Run test to verify it passes**

Run: `node --test lib/agent-upstream.test.ts lib/agent-mcp.test.ts`
Expected: PASS

### Task 7: Consume reply events and render editable agent blocks inline

**Files:**
- Modify: `src/components/WritingInterface.tsx`
- Modify: `src/lib/agent-relay.ts`
- Modify: `src/lib/agent-live-session.ts`
- Test: `src/lib/agent-live-session.test.ts`, `src/components/editor-behavior.test.ts`

**Step 1: Write the failing tests**

Cover:
- reply events are inserted directly under the originating prompt
- multiple tagged agents can resolve in finish order
- agent handoff lines containing new `@agent` tags create follow-up tasks
- unclear replies become editable reply blocks rather than silent failures

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/agent-live-session.test.ts src/components/editor-behavior.test.ts`
Expected: FAIL on missing reply-consumer behavior.

**Step 3: Write minimal implementation**

Poll unread reply events during the live session, patch the active page content, remove pending placeholders, and let explicit handoff tags continue the thread.

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/agent-live-session.test.ts src/components/editor-behavior.test.ts`
Expected: PASS

### Task 8: Update docs and local agent primer for the new polling contract

**Files:**
- Modify: `src/lib/agent-pairing.ts`
- Modify: `docs/supabase-agents.sql`
- Create: `docs/agent-live-session.md`
- Test: `src/lib/agent-pairing.test.ts`

**Step 1: Write the failing tests**

Add tests that assert the copied handoff now mentions:
- live-session toggles
- `@agent` prompts
- the claim/reply polling flow for external agents

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/agent-pairing.test.ts`
Expected: FAIL until the primer is updated.

**Step 3: Write minimal implementation**

Document the live contract clearly enough that a paired Codex/Claude/Cursor/Poke agent can run a polling loop without extra reverse-engineering.

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/agent-pairing.test.ts`
Expected: PASS

### Task 9: Final verification

**Files:**
- Verify only

**Step 1: Run targeted test suite**

Run:
- `node --test src/lib/agent-live-session.test.ts`
- `node --test src/lib/agent-pairing.test.ts`
- `node --test lib/agent-upstream.test.ts lib/agent-mcp.test.ts`
- `node --test src/components/editor-behavior.test.ts`

**Step 2: Run build**

Run: `npm run build`

**Step 3: Report remaining gaps honestly**

Call out that actual autonomous external-agent execution still requires each external agent runtime to run the new poll/claim loop, even though ezWrite now exposes the queue and reply path.

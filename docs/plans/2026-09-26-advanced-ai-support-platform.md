# HelzerX Studio Advanced AI Support Platform Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing ticket bot into a central HelzerX Studio AI support/operations agent that can understand and manage customer requests across billing, payments, orders, hosting, Minecraft, domains, rewards, accounts, and technical support, while keeping destructive/payment decisions behind explicit controls.

**Architecture:** Keep Discord tickets and MongoDB as the support shell, but move AI actions behind a service-agnostic tool registry. VPS becomes one integration rather than the center of the design. A configurable HelzerX business API adapter supplies real account, order, payment, product, and service state; the AI never invents those facts.

**Tech Stack:** Node.js 22+, discord.js 14, MongoDB/Mongoose, `@google/genai`, REST integrations, Node test runner.

## Global Constraints

- The AI must sound like a professional human support teammate without claiming to be human.
- Sinhala, English, and Singlish user messages must be understood.
- Real account/payment/order/service facts must come from tools or configured knowledge; never invent them.
- VPS operations are only one part of the platform.
- Payment/refund decisions must not be autonomously approved by the AI unless an explicitly authorized business API operation exists.
- Destructive actions require explicit confirmation in the current ticket.
- Staff takeover must silence the AI.
- AI/API failures must never leave a ticket stuck after typing; the customer receives a safe fallback and staff can be alerted.
- No shell/Docker/SSH tool is exposed to the model.
- Secrets must never be requested or echoed.
- Every externally observable action must be auditable through ticket AI statistics/logging.
- Existing ticket, invite, and VPS behavior must remain compatible.

---

### Task 1: Build the service-agnostic business integration boundary

**Files:**
- Create: `src/integrations/helzerxClient.js`
- Modify: `src/config/config.js`
- Test: `tests/ai-agent.test.js`

**Interfaces:**
- Consumes: `HELZERX_API_URL`, `HELZERX_API_TOKEN`, `HELZERX_API_TIMEOUT_MS`.
- Produces: `HelzerXClient.health()`, `customer(userId)`, `services(userId)`, `orders(userId)`, `invoice(invoiceId)`, `payment(paymentId)`, `createPaymentLink(input)`, `domains(userId)`, `minecraft(userId)`, `aiAgents(userId)`.

- [ ] **Step 1: Add focused failing tests** for endpoint construction, authentication headers, timeout behavior, and disabled integration behavior.
- [ ] **Step 2: Verify the focused test fails** because the client does not exist.
- [ ] **Step 3: Implement the REST adapter** with bounded timeouts, JSON parsing, non-2xx errors, and no secret logging.
- [ ] **Step 4: Verify the focused test passes.**
- [ ] **Step 5: Run `npm run test:syntax` and the AI test suite.**
- [ ] **Step 6: Commit:** `feat: add service agnostic HelzerX business API client`.

### Task 2: Expand the AI tool layer from VPS support to full business support

**Files:**
- Modify: `src/ai/tools.js`
- Modify: `src/ai/knowledge.js`
- Modify: `src/ai/support.js`
- Modify: `tests/ai-agent.test.js`
- Modify: `tests/ai-support.test.js`

**Interfaces:**
- Consumes: `HelzerXClient` plus existing `VPSBotClient`, invite tracker, ticket database.
- Produces tools for account lookup, service lookup, order lookup, invoice/payment status, payment-link creation, domains, Minecraft services, AI agents, ticket summaries, staff escalation, and existing VPS/invite operations.

- [ ] **Step 1: Add failing registry tests** requiring non-VPS support tools and explicitly forbidding shell/Docker/SSH tools.
- [ ] **Step 2: Verify red.**
- [ ] **Step 3: Implement the new tool declarations and executor routing.** Read-only business tools may run automatically; payment-link creation requires the configured business API; refunds/payment reversals escalate unless the API explicitly exposes an authorized operation.
- [ ] **Step 4: Upgrade the support prompt** with intent classification, service-aware tool selection, multilingual behavior, concise human-like replies, and strict factual boundaries.
- [ ] **Step 5: Verify focused tests and existing VPS tests.**
- [ ] **Step 6: Commit:** `feat: expand AI support tools across HelzerX services`.

### Task 3: Make the ticket runtime reliable and production-grade

**Files:**
- Modify: `src/events/discord/aiSupport.js`
- Modify: `src/ai/support.js`
- Modify: `src/database/Schema.js`
- Modify: `tests/ai-support.test.js`

**Interfaces:**
- Consumes: generated AI reply plus tool results.
- Produces: guaranteed customer-facing fallback on AI failure, structured escalation, action metadata, intent/priority/summary fields, and staff takeover behavior.

- [ ] **Step 1: Add failing tests** for API failure fallback, empty model output, tool failure recovery, and staff escalation.
- [ ] **Step 2: Verify red.**
- [ ] **Step 3: Implement retry/fallback behavior, bounded tool rounds, structured error reporting, and guaranteed ticket response after typing.
- [ ] **Step 4: Persist AI intent, priority, summary, action timestamps, and escalation state.
- [ ] **Step 5: Verify all AI tests plus `npm test`.
- [ ] **Step 6: Commit:** `fix: harden AI ticket runtime and escalation`.

### Task 4: Add operational knowledge and administrator controls

**Files:**
- Create: `src/ai/knowledge/*.md` service knowledge files
- Create: `src/commands/AI/AI.js`
- Modify: `src/structures/handlers/CommandHandler.js` only if command registration requires it
- Modify: `src/database/Manager.js` for AI settings helpers
- Modify: `tests/ai-agent.test.js`

**Interfaces:**
- Consumes: guild AI configuration and knowledge files.
- Produces: `.ai status`, `.ai enable`, `.ai disable`, `.ai stats`, `.ai takeover`, `.ai resume`, and knowledge reload controls.

- [ ] **Step 1: Add failing command/config tests.**
- [ ] **Step 2: Verify red.**
- [ ] **Step 3: Implement admin-only controls and safe per-category AI settings.
- [ ] **Step 4: Add service knowledge files for billing, payments, hosting, Minecraft, domains, rewards, accounts, and general support.
- [ ] **Step 5: Run `npm test`, `npm run test:syntax`, and `npm run test:ai`.
- [ ] **Step 6: Commit:** `feat: add AI operations controls and service knowledge`.

## External integration seam

The ticket bot cannot truthfully manage real payments, orders, domains, or other services until those systems expose authenticated APIs. This implementation therefore creates a single `HELZERX_API_URL` boundary rather than embedding provider-specific assumptions. Payment providers can later be connected behind that API without changing Discord/AI behavior.

## Product decisions intentionally left configurable

- Which payment provider(s) are authoritative.
- Which HelzerX backend endpoints and response fields are exposed.
- Which staff roles may approve refunds/payment reversals.
- Which service actions are allowed automatically versus confirmation-required.
- Which ticket categories enable AI.

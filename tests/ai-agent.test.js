import test from "node:test";
import assert from "node:assert/strict";
import { assertResourceOwnership, toolDeclarations } from "../src/ai/tools.js";
import { buildKnowledgeContext } from "../src/ai/knowledge.js";
import { config } from "../src/config/config.js";
import TicketUI from "../src/structures/classes/TicketUI.js";

test("AI tool registry exposes full business support without shell access", () => {
  const names = toolDeclarations.map((tool) => tool.name);

  for (const name of [
    "get_service_catalog",
    "get_service",
    "request_service_action",
    "get_customer_profile",
    "get_customer_services",
    "get_customer_orders",
    "get_invoice",
    "get_payment",
    "create_payment_link",
    "get_customer_domains",
    "get_customer_minecraft",
    "get_customer_ai_agents",
    "get_user_invites",
    "create_vps",
    "restart_vps",
    "escalate_to_staff",
  ]) {
    assert.ok(names.includes(name), name);
  }

  assert.ok(!names.includes("docker_exec"));
  assert.ok(!names.includes("shell"));
  assert.ok(!names.includes("ssh_exec"));
});

test("Minecraft catalog contains the published HelzerX Cloud plans", () => {
  const knowledge = buildKnowledgeContext();
  for (const plan of ["HXC-S02", "HXC-S04", "HXC-S06", "HXC-S08", "HXC-S12", "HXC-S16", "HXC-S24", "HXC-S32", "HXC-S48", "HXC-S64"]) assert.match(knowledge, new RegExp(plan));
  assert.match(knowledge, /HXC-S02.*2GB RAM.*100% CPU Power.*20GB NVMe.*\$0\.69\/month/i);
  assert.match(knowledge, /HXC-S64.*64GB RAM.*1200% CPU Power.*640GB NVMe.*\$14\.99\/month/i);
  assert.match(knowledge, /Singapore, India, Germany, Hong Kong, USA, Vietnam, and Australia/i);
});

test("invite VPS plan is explicit and deterministic", () => {
  const plan = config.invitePlans.find((item) => item.id === "3-invite-vps");
  assert.equal(plan.requiredInvites, 3);
  assert.equal(plan.ramMb, 12288);
  assert.equal(plan.cpuCores, 4);
  assert.equal(plan.diskGb, 20);
  assert.equal(plan.durationDays, 7);
});

test("knowledge context describes the full HelzerX support surface", () => {
  const knowledge = buildKnowledgeContext();
  assert.match(knowledge, /central support and operations agent/i);
  assert.match(knowledge, /billing, payments, domains, Minecraft hosting, AI agents/i);
  assert.match(knowledge, /automatically choose a suitable available node and OS/i);
  assert.match(knowledge, /feedback channel/i);
});


test("ticket control panel exposes polished AI support controls", () => {
  const ticket = {
    ticketId: "ticket_0000837",
    status: "open",
    userId: "123456789",
    claimedBy: null,
    aiStats: { humanTakeover: false },
  };
  const category = {
    name: "Account Issue",
    description: "Login, password reset, or client area account problems",
    supportRoles: ["987654321"],
    settings: { aiEnabled: true, welcomeMessage: "Tell us what happened and we'll help." },
  };

  const panel = TicketUI.buildTicketPanel(ticket, category);
  const json = panel.toJSON();

  const serialized = JSON.stringify(json);
  assert.match(serialized, /Account Issue/);
  assert.match(serialized, /Category Focus/);
  assert.match(serialized, /AI Support Online/);
  assert.match(serialized, /ticket_claim_ticket_0000837/);
  assert.match(serialized, /ticket_transcript_ticket_0000837/);
  assert.match(serialized, /Quick Resolution Guide/);
});


test("AI support resource ownership checks fail closed when owner data is missing", () => {
  assert.throws(
    () => assertResourceOwnership({ id: "invoice-1" }, "invoice", "customer-1"),
    /Unable to verify ownership/i,
  );
});

test("AI support resource ownership checks reject another customer's resource", () => {
  assert.throws(
    () => assertResourceOwnership({ user_id: "customer-2" }, "service", "customer-1"),
    /Unable to verify ownership/i,
  );
});

test("AI support resource ownership checks accept the verified owner", () => {
  const resource = { user_id: "customer-1", id: "service-1" };
  assert.equal(assertResourceOwnership(resource, "service", "customer-1"), resource);
});

test("AI tool registry never exposes arbitrary shell, SSH, or Docker execution", () => {
  const names = toolDeclarations.map((tool) => tool.name);
  assert.equal(names.some((name) => /shell|ssh_exec|docker_exec|execute_command/i.test(name)), false);
});


test("autonomous AI actions are disabled by default unless explicitly opted in", () => {
  if (process.env.AI_AUTO_ACTIONS == null) {
    assert.equal(config.ai.autoActions, false);
  }
});

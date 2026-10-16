import { config } from "#config/config";
import { VPSBotClient } from "#integrations/vpsClient";
import { HelzerXClient } from "#integrations/helzerxClient";
import TicketUI from "#structures/classes/TicketUI";

const declaration = (name, description, properties = {}, required = []) => ({
  name,
  description,
  parameters: { type: "OBJECT", properties, required },
});

export const toolDeclarations = [
  declaration("get_service_catalog", "List real HelzerX products and services currently available.", {}),
  declaration("get_service", "Read one customer service by service ID.", { service_id: { type: "STRING", description: "Service ID." } }, ["service_id"]),
  declaration("request_service_action", "Request an approved service operation such as renewal, suspension, reactivation, or cancellation through the business API. The business API enforces permissions and billing rules.", { service_id: { type: "STRING", description: "Customer service ID." }, action: { type: "STRING", description: "Requested operation." }, confirmed: { type: "BOOLEAN", description: "Explicit confirmation in the current ticket for destructive or money-affecting actions." } }, ["service_id", "action"]),
  declaration("get_customer_profile", "Read the customer's real HelzerX account profile and account status.", {
    user_id: { type: "STRING", description: "Customer Discord user ID." },
  }, ["user_id"]),
  declaration("get_customer_services", "List the customer's active and historical HelzerX services across supported products.", {
    user_id: { type: "STRING", description: "Customer Discord user ID." },
  }, ["user_id"]),
  declaration("get_customer_orders", "List the customer's orders and their real statuses.", {
    user_id: { type: "STRING", description: "Customer Discord user ID." },
  }, ["user_id"]),
  declaration("get_invoice", "Read the real status and details of a customer invoice.", {
    invoice_id: { type: "STRING", description: "Invoice ID." },
  }, ["invoice_id"]),
  declaration("get_payment", "Read the real status of a payment transaction.", {
    payment_id: { type: "STRING", description: "Payment transaction ID." },
  }, ["payment_id"]),
  declaration("create_payment_link", "Create an official payment link for an existing payable invoice/order. Never invent payment URLs.", {
    invoice_id: { type: "STRING", description: "Invoice ID to pay." },
    return_url: { type: "STRING", description: "Optional safe return URL configured by the business system." },
  }, ["invoice_id"]),
  declaration("get_customer_domains", "List domains associated with the customer.", {
    user_id: { type: "STRING", description: "Customer Discord user ID." },
  }, ["user_id"]),
  declaration("get_customer_minecraft", "List the customer's Minecraft services and real status.", {
    user_id: { type: "STRING", description: "Customer Discord user ID." },
  }, ["user_id"]),
  declaration("get_customer_ai_agents", "List the customer's AI agent services and real status.", {
    user_id: { type: "STRING", description: "Customer Discord user ID." },
  }, ["user_id"]),
  declaration("get_user_invites", "Check the customer's tracked successful Discord invites.", {
    user_id: { type: "STRING", description: "Discord user ID of the customer." },
  }, ["user_id"]),
  declaration("get_vps_plans", "Get the currently configured VPS plans and their resources/durations.", {}),
  declaration("get_vps_nodes", "Get available VPS nodes and current capacity.", {}),
  declaration("get_vps_operating_systems", "Get the operating systems supported by the VPS bot.", {}),
  declaration("create_vps", "Provision a VPS through the official HelzerX VPS bot. Select node and OS automatically unless explicitly requested.", {
    user_id: { type: "STRING", description: "Customer Discord user ID." },
    plan_id: { type: "STRING", description: "VPS plan ID." },
    node_id: { type: "STRING", description: "Optional node ID selected after checking capacity." },
    os_id: { type: "STRING", description: "Optional operating system ID." },
    name: { type: "STRING", description: "Optional VPS name." },
  }, ["user_id", "plan_id"]),
  declaration("get_user_vps", "List the customer's VPS instances.", {
    user_id: { type: "STRING", description: "Customer Discord user ID." },
  }, ["user_id"]),
  declaration("get_vps_status", "Read the status and details of one customer's VPS.", {
    vps_id: { type: "STRING", description: "VPS ID." },
  }, ["vps_id"]),
  declaration("start_vps", "Start one of the customer's VPS instances.", {
    vps_id: { type: "STRING", description: "VPS ID." },
  }, ["vps_id"]),
  declaration("stop_vps", "Stop one of the customer's VPS instances.", {
    vps_id: { type: "STRING", description: "VPS ID." },
  }, ["vps_id"]),
  declaration("restart_vps", "Restart one of the customer's VPS instances.", {
    vps_id: { type: "STRING", description: "VPS ID." },
  }, ["vps_id"]),
  declaration("get_vps_stats", "Read live resource statistics for one VPS.", {
    vps_id: { type: "STRING", description: "VPS ID." },
  }, ["vps_id"]),
  declaration("get_vps_logs", "Read recent logs from one VPS.", {
    vps_id: { type: "STRING", description: "VPS ID." },
  }, ["vps_id"]),
  declaration("delete_vps", "Permanently delete a customer's VPS. Explicit confirmation is mandatory and the current AI layer keeps deletion staff-controlled.", {
    vps_id: { type: "STRING", description: "VPS ID." },
    confirmed: { type: "BOOLEAN", description: "True only after explicit customer confirmation in the current ticket." },
  }, ["vps_id", "confirmed"]),
  declaration("escalate_to_staff", "Hand the ticket to human staff for payment decisions, refunds, security issues, disputes, policy exceptions, or unavailable operations.", {
    reason: { type: "STRING", description: "Short reason staff should see." },
    priority: { type: "STRING", description: "low, normal, high, or urgent." },
  }, ["reason"]),
];

const cleanVps = (vps) => ({
  id: vps.id,
  name: vps.name,
  status: vps.status,
  cpu_cores: vps.cpu_cores,
  ram_mb: vps.ram_mb,
  disk_gb: vps.disk_gb,
  image: vps.image,
  host_port: vps.host_port,
  node_id: vps.node_id,
  node_name: vps.node_name,
  os: vps.os,
  duration_days: vps.duration_days,
});

export function createToolExecutor({ client, message, ticket, category }) {
  const vps = new VPSBotClient();
  const business = new HelzerXClient();
  const userId = message.author.id;

  const assertSelf = (candidate) => {
    if (String(candidate) !== String(userId)) throw new Error("Customer identity mismatch.");
  };

  const ownedVps = async (vpsId) => {
    const result = await vps.getVps(vpsId);
    if (!result?.vps || String(result.vps.owner_id) !== String(userId)) {
      throw new Error("That VPS does not belong to this customer.");
    }
    return result.vps;
  };

  return {
    async get_service_catalog() {
      return business.catalog();
    },
    async get_service(args) {
      const result = await business.service(args.service_id);
      if (result?.service?.user_id && String(result.service.user_id) !== String(userId)) throw new Error("That service does not belong to this customer.");
      return result;
    },
    async request_service_action(args) {
      const action = String(args.action || "").toLowerCase();
      const destructive = new Set(["cancel", "delete", "terminate", "refund", "suspend"]);
      if (destructive.has(action) && args.confirmed !== true) throw new Error("Explicit confirmation is required for this service action.");
      const result = await business.serviceAction({ service_id: args.service_id, user_id: userId, action, confirmed: args.confirmed === true });
      return result;
    },
    async get_customer_profile(args) {
      assertSelf(args.user_id);
      return business.customer(userId);
    },
    async get_customer_services(args) {
      assertSelf(args.user_id);
      return business.services(userId);
    },
    async get_customer_orders(args) {
      assertSelf(args.user_id);
      return business.orders(userId);
    },
    async get_invoice(args) {
      const result = await business.invoice(args.invoice_id);
      if (result?.invoice?.user_id && String(result.invoice.user_id) !== String(userId)) {
        throw new Error("That invoice does not belong to this customer.");
      }
      return result;
    },
    async get_payment(args) {
      const result = await business.payment(args.payment_id);
      if (result?.payment?.user_id && String(result.payment.user_id) !== String(userId)) {
        throw new Error("That payment does not belong to this customer.");
      }
      return result;
    },
    async create_payment_link(args) {
      return business.createPaymentLink({
        invoice_id: args.invoice_id,
        user_id: userId,
        return_url: args.return_url,
      });
    },
    async get_customer_domains(args) {
      assertSelf(args.user_id);
      return business.domains(userId);
    },
    async get_customer_minecraft(args) {
      assertSelf(args.user_id);
      return business.minecraft(userId);
    },
    async get_customer_ai_agents(args) {
      assertSelf(args.user_id);
      return business.aiAgents(userId);
    },
    async get_user_invites(args) {
      assertSelf(args.user_id);
      return client.inviteTracker.getUserInvites(message.guild, userId);
    },
    async get_vps_plans() {
      if (vps.enabled) return vps.plans();
      return { plans: config.invitePlans };
    },
    async get_vps_nodes() {
      if (!vps.enabled) throw new Error("VPS bot integration is not configured.");
      return vps.nodes();
    },
    async get_vps_operating_systems() {
      if (!vps.enabled) throw new Error("VPS bot integration is not configured.");
      return vps.operatingSystems();
    },
    async create_vps(args) {
      if (!config.ai.autoActions) throw new Error("Automatic VPS actions are disabled.");
      assertSelf(args.user_id);
      const plan = config.invitePlans.find((item) => item.id === args.plan_id);
      if (!plan) throw new Error("Unknown invite VPS plan.");
      const inviteInfo = await client.inviteTracker.getUserInvites(message.guild, userId);
      if (inviteInfo.successfulInvites < plan.requiredInvites) {
        return { success: false, reason: "not_eligible", invites: inviteInfo.successfulInvites, required: plan.requiredInvites };
      }
      if (!vps.enabled) throw new Error("VPS bot integration is not configured.");
      const nodeData = await vps.nodes();
      const availableNodes = (nodeData.nodes || []).filter((node) => node.available);
      if (!availableNodes.length) return { success: false, reason: "no_capacity" };
      const node = availableNodes.find((item) => item.id === args.node_id)
        || [...availableNodes].sort((a, b) => (b.available_ram_mb || 0) - (a.available_ram_mb || 0))[0];
      const osData = await vps.operatingSystems();
      const systems = osData.operating_systems || [];
      const os = systems.find((item) => item.id === args.os_id)
        || systems.find((item) => item.id === plan.defaultOs)
        || systems.find((item) => item.image === "ubuntu:24.04")
        || systems[0];
      if (!os) return { success: false, reason: "no_operating_system" };
      const created = await vps.createVps({
        owner_id: userId,
        name: args.name || ("Helzer-" + userId),
        cpu_cores: plan.cpuCores,
        ram_mb: plan.ramMb,
        disk_gb: plan.diskGb,
        duration_days: plan.durationDays,
        node_id: node.id,
        image: os.image,
      });
      await client.db.updateTicket(ticket.ticketId, {
        "aiStats.lastActionAt": new Date(),
        "aiStats.intent": "vps_provisioning",
      });
      return { success: true, plan, selected_node: node, selected_os: os, vps: cleanVps(created.vps) };
    },
    async get_user_vps(args) {
      assertSelf(args.user_id);
      if (!vps.enabled) throw new Error("VPS bot integration is not configured.");
      return vps.listForUser(userId);
    },
    async get_vps_status(args) { return { vps: cleanVps(await ownedVps(args.vps_id)) }; },
    async start_vps(args) { return { vps: cleanVps((await vps.action(args.vps_id, "start")).vps) }; },
    async stop_vps(args) { return { vps: cleanVps((await vps.action(args.vps_id, "stop")).vps) }; },
    async restart_vps(args) { return { vps: cleanVps((await vps.action(args.vps_id, "restart")).vps) }; },
    async get_vps_stats(args) { await ownedVps(args.vps_id); return vps.stats(args.vps_id); },
    async get_vps_logs(args) { await ownedVps(args.vps_id); return vps.logs(args.vps_id); },
    async delete_vps(args) {
      if (args.confirmed !== true) throw new Error("Explicit confirmation is required before deleting a VPS.");
      await ownedVps(args.vps_id);
      throw new Error("VPS deletion is intentionally staff-controlled in the AI support layer.");
    },
    async escalate_to_staff(args) {
      const priority = ["low", "normal", "high", "urgent"].includes(args.priority) ? args.priority : "normal";
      await client.db.updateTicket(ticket.ticketId, {
        "aiStats.escalated": true,
        "aiStats.humanTakeover": true,
        "aiStats.priority": priority,
        "aiStats.intent": "human_escalation",
        "aiStats.lastActionAt": new Date(),
      });
      const roles = category?.supportRoles || [];
      const mention = roles.length ? roles.map((roleId) => "<@&" + roleId + ">").join(" ") : "Support staff";
      await message.channel.send({
        components: [TicketUI.buildStaffEscalation({
          reason: String(args.reason).slice(0, 900),
          priority,
          ticketId: ticket.ticketId,
          customerId: userId,
          staffRoles: roles,
        })],
        flags: TicketUI.getFlags(),
        allowedMentions: { roles },
      });
      return { escalated: true, priority, reason: args.reason };
    },
  };
}

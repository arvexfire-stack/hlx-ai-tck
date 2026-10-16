import { config } from "#config/config";
import { generateSupportReply, formatHistory } from "#ai/support";
import TicketUI from "#structures/classes/TicketUI";
import { logger } from "#utils/logger";

const cooldowns = new Map();

const isStaffMessage = (message, category) =>
  category?.supportRoles?.some((roleId) => message.member?.roles?.cache?.has(roleId)) || false;

const FALLBACK_REPLY =
  "I’m having trouble checking that reliably right now. I don’t want to guess, so I’ve handed this over to the support team.";

async function notifyRuntimeEscalation({ message, ticket, category, reason }) {
  const roles = category?.supportRoles || [];
  const priority = "normal";

  await message.channel.send({
    components: [TicketUI.buildStaffEscalation({
      reason,
      priority,
      ticketId: ticket.ticketId,
      customerId: message.author.id,
      staffRoles: roles,
    })],
    flags: TicketUI.getFlags(),
    allowedMentions: { roles },
  }).catch(() => {});
}

export default {
  name: "messageCreate",

  async execute({ eventArgs, client }) {
    const [message] = eventArgs;
    if (!message.guild || message.author.bot || !message.channel?.isTextBased()) return;
    if (!config.ai.enabled || !config.ai.apiKey) return;

    const guildConfig = await client.db.getGuild(message.guild.id);
    if (guildConfig?.aiSupport?.enabled === false) return;

    const ticket = await client.db.getTicketByChannel(message.channel.id);
    if (!ticket || ticket.status !== "open") return;
    if (ticket.aiStats?.humanTakeover) return;

    const panel = await client.db.getPanel(ticket.panelId);
    const category = panel?.categories?.find((item) => item.categoryId === ticket.categoryId);
    if (!category || category.settings?.aiEnabled === false) return;

    const now = Date.now();
    const last = cooldowns.get(message.channel.id) || 0;
    if (now - last < config.ai.cooldownMs) return;

    const recent = await message.channel.messages.fetch({
      limit: Math.min(config.ai.historyLimit, 25),
    });
    const ordered = [...recent.values()].reverse();
    const previousMessages = ordered.filter((item) => item.id !== message.id);

    const staffRecentlyActive = previousMessages.some(
      (item) =>
        !item.author.bot &&
        isStaffMessage(item, category) &&
        now - item.createdTimestamp < config.ai.staffSilenceMs,
    );
    if (staffRecentlyActive) return;

    cooldowns.set(message.channel.id, now);
    await message.channel.sendTyping();

    try {
      const result = await generateSupportReply({
        guildName: message.guild.name,
        categoryName: category.name,
        categoryDescription: category.description || category.settings?.welcomeMessage || "",
        customerName: message.member?.displayName || message.author.username,
        history: formatHistory(previousMessages),
        latestMessage: message.content,
        model: category.settings?.aiModel || guildConfig?.aiSupport?.model || config.ai.model,
        client,
        message,
        ticket,
        category,
      });

      const text = result.text?.trim();

      if (!text) {
        cooldowns.delete(message.channel.id);
        await client.db.updateTicket(ticket.ticketId, {
          "aiStats.escalated": true,
          "aiStats.humanTakeover": true,
          "aiStats.priority": "normal",
          "aiStats.intent": "ai_no_response",
          "aiStats.lastError": "AI returned no customer-facing response.",
          "aiStats.lastInteractionAt": new Date(),
        });

        await message.channel.send({
          content: FALLBACK_REPLY,
          allowedMentions: { parse: [] },
        });

        await notifyRuntimeEscalation({
          message,
          ticket,
          category,
          reason: "The AI could not produce a reliable customer-facing response for this request.",
        });
        return;
      }

      await message.channel.send({
        content: text.slice(0, 1900),
        allowedMentions: { parse: [] },
      });

      await client.db.updateTicket(ticket.ticketId, {
        "aiStats.messages": (ticket.aiStats?.messages || 0) + 1,
        "aiStats.toolCalls": (ticket.aiStats?.toolCalls || 0) + result.toolCalls,
        "aiStats.lastInteractionAt": new Date(),
        "aiStats.lastError": null,
      });

      if (result.reason === "max_tool_rounds") {
        await client.db.updateTicket(ticket.ticketId, {
          "aiStats.escalated": true,
          "aiStats.humanTakeover": true,
          "aiStats.priority": "normal",
          "aiStats.intent": "ai_tool_limit",
          "aiStats.lastActionAt": new Date(),
        });

        await notifyRuntimeEscalation({
          message,
          ticket,
          category,
          reason: "The AI needed more tool checks than the configured safety limit, so human support should continue the ticket.",
        });
      }

      if (result.reason && result.reason !== "ai_disabled") {
        logger.warn("AI Support", "Guardrail used for ticket " + ticket.ticketId + ": " + result.reason);
      }
    } catch (error) {
      logger.error("AI Support", "Failed to process ticket " + ticket.ticketId, error);
      cooldowns.delete(message.channel.id);

      try {
        await message.channel.send({
          content: FALLBACK_REPLY,
          allowedMentions: { parse: [] },
        });

        await client.db.updateTicket(ticket.ticketId, {
          "aiStats.escalated": true,
          "aiStats.humanTakeover": true,
          "aiStats.priority": "normal",
          "aiStats.intent": "ai_runtime_failure",
          "aiStats.lastError": error.message || "AI runtime failure",
          "aiStats.lastInteractionAt": new Date(),
        });

        await notifyRuntimeEscalation({
          message,
          ticket,
          category,
          reason: "The AI support runtime failed while processing this ticket. Human support should continue from here.",
        });
      } catch (fallbackError) {
        logger.error("AI Support", "Failed to send AI fallback for ticket " + ticket.ticketId, fallbackError);
      }
    }
  },
};

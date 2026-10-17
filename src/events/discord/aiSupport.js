import { config } from "#config/config";
import { generateSupportReply, formatHistory, normalizeMessageContent } from "#ai/support";
import TicketUI from "#structures/classes/TicketUI";
import { logger } from "#utils/logger";

// Prevent duplicate Discord event delivery without dropping legitimate follow-up messages.
const seenMessageIds = new Set();
const messageQueues = new Map();

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
    if (seenMessageIds.has(message.id)) return;
    seenMessageIds.add(message.id);
    if (seenMessageIds.size > 5000) {
      const oldest = seenMessageIds.values().next().value;
      if (oldest) seenMessageIds.delete(oldest);
    }

    // Serialize customer messages per ticket channel. A fast follow-up must wait,
    // not be discarded by a cooldown while the previous message is being handled.
    const channelId = message.channel.id;
    const previousTask = messageQueues.get(channelId) || Promise.resolve();
    const currentTask = previousTask.catch(() => {}).then(() => this.processMessage({ message, client }));
    messageQueues.set(channelId, currentTask);
    try {
      await currentTask;
    } finally {
      if (messageQueues.get(channelId) === currentTask) messageQueues.delete(channelId);
    }
  },

  async processMessage({ message, client }) {
    if (!config.ai.enabled || !config.ai.apiKey) {
      logger.warn("AI Support", "Skipped message: AI is disabled or Gemini API key is not configured.");
      return;
    }

    const guildConfig = await client.db.getGuild(message.guild.id);
    if (guildConfig?.aiSupport?.enabled === false) {
      logger.info("AI Support", "Skipped ticket message: guild AI support is disabled.");
      return;
    }

    const ticket = await client.db.getTicketByChannel(message.channel.id);
    if (!ticket || ticket.status !== "open") return;
    if (ticket.aiStats?.humanTakeover) {
      logger.info("AI Support", "Skipped ticket " + ticket.ticketId + ": human takeover is active.");
      return;
    }

    const panel = await client.db.getPanel(ticket.panelId);
    const category = panel?.categories?.find((item) => item.categoryId === ticket.categoryId);
    if (!category || category.settings?.aiEnabled === false) {
      logger.info("AI Support", "Skipped ticket " + ticket.ticketId + ": category missing or AI disabled.");
      return;
    }

    const now = Date.now();

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
    if (staffRecentlyActive) {
      logger.info("AI Support", "Skipped ticket " + ticket.ticketId + ": support staff recently replied.");
      return;
    }

    logger.info("AI Support", "Processing customer message for ticket " + ticket.ticketId + " in category " + category.name + ".");
    await message.channel.sendTyping();

    try {
      const result = await generateSupportReply({
        guildName: message.guild.name,
        categoryName: category.name,
        categoryDescription: category.description || category.settings?.welcomeMessage || "",
        customerName: message.member?.displayName || message.author.username,
        history: formatHistory(previousMessages),
        latestMessage: normalizeMessageContent(message),
        model: category.settings?.aiModel || guildConfig?.aiSupport?.model || config.ai.model,
        client,
        message,
        ticket,
        category,
      });

      const latestTicket = await client.db.getTicket(ticket.ticketId);
      if (!latestTicket || latestTicket.status !== "open") return;
      if (latestTicket.aiStats?.humanTakeover && result.reason !== "human_escalation") return;

      const text = result.text?.trim();
      logger.info("AI Support", "Completed ticket " + ticket.ticketId + ": hasText=" + Boolean(text) + ", toolCalls=" + result.toolCalls + ", reason=" + (result.reason || "none") + ".");

      if (!text) {
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

      if (result.reason === "max_tool_rounds" || result.reason === "empty_model_response") {
        const emptyResponse = result.reason === "empty_model_response";
        const diagnostic = result.diagnostic || {};
        await client.db.updateTicket(ticket.ticketId, {
          "aiStats.escalated": true,
          "aiStats.humanTakeover": true,
          "aiStats.priority": "normal",
          "aiStats.intent": emptyResponse ? "ai_no_response" : "ai_tool_limit",
          "aiStats.lastError": emptyResponse
            ? "Gemini returned no customer-facing text (finishReason=" + diagnostic.finishReason + ", blockReason=" + diagnostic.blockReason + ")."
            : null,
          "aiStats.lastActionAt": new Date(),
        });

        await notifyRuntimeEscalation({
          message,
          ticket,
          category,
          reason: emptyResponse
            ? "The AI provider returned no customer-facing text. Human support should continue this ticket."
            : "The AI needed more tool checks than the configured safety limit, so human support should continue the ticket.",
        });
      }

      if (result.reason && result.reason !== "ai_disabled") {
        const diagnostic = result.diagnostic
          ? " (finishReason=" + result.diagnostic.finishReason + ", blockReason=" + result.diagnostic.blockReason + ", candidates=" + result.diagnostic.candidateCount + ", promptTokens=" + result.diagnostic.promptTokenCount + ", outputTokens=" + result.diagnostic.candidatesTokenCount + ", thinkingTokens=" + result.diagnostic.thoughtsTokenCount + ")"
          : "";
        logger.warn("AI Support", "Guardrail used for ticket " + ticket.ticketId + ": " + result.reason + diagnostic);
      }
    } catch (error) {
      logger.error("AI Support", "Failed to process ticket " + ticket.ticketId, error);

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
          "aiStats.lastError": (error?.name || "Error") + ": AI runtime failure; see restricted service logs for details.",
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

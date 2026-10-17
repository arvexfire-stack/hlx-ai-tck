import { config } from "#config/config";
import { generateSupportReply, formatHistory, normalizeMessageContent, isQuotaExhaustedError } from "#ai/support";
import TicketUI from "#structures/classes/TicketUI";
import { logger } from "#utils/logger";

// Prevent duplicate Discord event delivery without dropping legitimate follow-up messages.
const seenMessageIds = new Set();
const messageQueues = new Map();

// A configured ticket role alone is not sufficient proof of staff activity: some
// servers accidentally grant the same "Support" role to customers. Only suppress
// AI when the author has a staff-level Discord permission AND a configured support role.
const isStaffMessage = (message, category) => {
  const hasSupportRole = category?.supportRoles?.some((roleId) =>
    message.member?.roles?.cache?.has(roleId),
  ) || false;
  const permissions = message.member?.permissions;
  const hasStaffPermission = Boolean(
    permissions?.has?.("Administrator")
    || permissions?.has?.("ManageMessages")
    || permissions?.has?.("ManageChannels"),
  );
  return hasSupportRole && hasStaffPermission;
};

const QUOTA_ERROR_MARKER = "Gemini API quota exhausted";
let quotaCooldownUntil = 0;

export function classifyProviderFailure(error) {
  if (isQuotaExhaustedError(error)) {
    return {
      code: "gemini_quota_exhausted",
      customerMessage: "Gemini has reached this project's daily request quota. I can't verify the requested information until the quota becomes available again.",
      staffReason: "Gemini API daily free-tier request quota is exhausted (HTTP 429 / RESOURCE_EXHAUSTED). No AI-generated diagnosis is available because the model request was rejected before generating a response.",
      retryDelayMs: quotaRetryDelayMs(error),
    };
  }

  const message = String(error?.message || "");
  if (/timed out|timeout/i.test(message)) {
    return {
      code: "ai_provider_timeout",
      customerMessage: "The AI provider did not respond before the request timed out. I couldn't verify the answer, so please continue with support staff while the service recovers.",
      staffReason: "The AI provider request timed out before producing a response. This is a provider/network timeout, not an AI-generated diagnosis; check provider latency and connectivity.",
      retryDelayMs: 60_000,
    };
  }

  return {
    code: "ai_provider_error",
    customerMessage: "The AI provider returned an error before I could verify the answer. I don't want to guess, so support staff have been notified.",
    staffReason: "The AI provider request failed before generating a response. Review the restricted service logs for the underlying provider error.",
    retryDelayMs: 60_000,
  };
}

function quotaRetryDelayMs(error) {
  const message = String(error?.message || "");
  const retrySeconds = message.match(/retry in\s+(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/i);
  if (retrySeconds) {
    const hours = Number(retrySeconds[1] || 0);
    const minutes = Number(retrySeconds[2] || 0);
    const seconds = Number(retrySeconds[3] || 0);
    const parsed = ((hours * 60 + minutes) * 60 + seconds) * 1000;
    if (parsed > 0) return parsed + 30_000;
  }
  // A conservative fallback prevents repeatedly hitting a known exhausted quota.
  return 60 * 60 * 1000;
}

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

    // Every customer message, including greetings and acknowledgements, goes through
    // the model so customer-facing support replies are genuinely AI-generated.
    // Open a local circuit breaker after a confirmed daily quota error. Avoid one
    // doomed API request per customer message until the provider says to retry.
    if (Date.now() < quotaCooldownUntil) {
      const alreadyNotified = ticket.aiStats?.lastError === QUOTA_ERROR_MARKER;
      await client.db.updateTicket(ticket.ticketId, {
        "aiStats.escalated": true,
        "aiStats.priority": "normal",
        "aiStats.intent": "ai_quota_exhausted",
        "aiStats.lastError": QUOTA_ERROR_MARKER,
        "aiStats.lastInteractionAt": new Date(),
      });
      if (!alreadyNotified) {
        await notifyRuntimeEscalation({
          message,
          ticket,
          category,
          reason: "The Gemini API project has exhausted its current request quota. AI requests are temporarily paused to avoid repeated failures; no AI-generated reply can be produced until quota becomes available.",
        });
      }
      // Deliberately do not send a canned customer reply: all support replies must
      // be generated by the model. The original customer message remains in-ticket.
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

      if (result.reason === "human_escalation") {
        // The escalation tool already notified staff and enabled takeover. Do not
        // send a canned customer message or overwrite the human-escalation state.
        await client.db.updateTicket(ticket.ticketId, {
          "aiStats.messages": (ticket.aiStats?.messages || 0) + 1,
          "aiStats.toolCalls": (ticket.aiStats?.toolCalls || 0) + result.toolCalls,
          "aiStats.lastInteractionAt": new Date(),
          "aiStats.lastError": null,
        });
        return;
      }

      if (!text) {
        // An empty provider response is a recoverable AI failure, not a staff claim.
        // Keep the ticket eligible for a later customer message after notifying staff.
        await client.db.updateTicket(ticket.ticketId, {
          "aiStats.escalated": true,
          "aiStats.priority": "normal",
          "aiStats.intent": "ai_no_response",
          "aiStats.lastError": "AI returned no customer-facing response.",
          "aiStats.lastInteractionAt": new Date(),
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
        // Tool-limit and empty-response guardrails should not permanently mute AI.
        // A staff member can still claim the ticket explicitly when needed.
        await client.db.updateTicket(ticket.ticketId, {
          "aiStats.escalated": true,
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
      const failure = classifyProviderFailure(error);
      const quotaExhausted = failure.code === "gemini_quota_exhausted";
      // Only a confirmed daily quota error may open the long quota circuit breaker.
      // A timeout or generic 5xx must never be mislabeled as quota exhaustion.
      if (quotaExhausted) {
        quotaCooldownUntil = Math.max(quotaCooldownUntil, Date.now() + failure.retryDelayMs);
      }
      logger.error("AI Support", "Failed to process ticket " + ticket.ticketId + ": " + failure.code + ". See provider error details below.", error);

      try {
        // A provider/API outage must not permanently disable AI for this ticket.
        // Keep a precise machine-classified reason; do not imply the model wrote
        // a diagnosis when the model failed before generating any response.
        await client.db.updateTicket(ticket.ticketId, {
          "aiStats.escalated": true,
          "aiStats.priority": "normal",
          "aiStats.intent": failure.code,
          "aiStats.lastError": quotaExhausted ? QUOTA_ERROR_MARKER : failure.code + ": " + (error?.name || "Error"),
          "aiStats.lastInteractionAt": new Date(),
        });

        await notifyRuntimeEscalation({
          message,
          ticket,
          category,
          reason: failure.staffReason,
        });
      } catch (fallbackError) {
        logger.error("AI Support", "Failed to send AI fallback for ticket " + ticket.ticketId, fallbackError);
      }
    }
  },
};

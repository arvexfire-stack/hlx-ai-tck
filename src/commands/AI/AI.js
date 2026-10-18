import { Command } from "#structures/classes/Command";
import { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags } from "discord.js";
import { askGeminiDirect, summarizeTicket, diagnoseCrashLog, analyzeSentiment } from "#ai/support";
import { config } from "#config/config";

const build = (title, body) => new ContainerBuilder()
  .addTextDisplayComponents(new TextDisplayBuilder().setContent("## " + title + "\n\n" + body));

class AICommand extends Command {
  constructor() {
    super({
      name: "ai",
      description: "Manage and query HelzerX Technologies AI operations",
      usage: "ai <ask|summarize|diagnose|status|stats|enable|disable|takeover|resume>",
      examples: [
        "ai ask How do I fix Minecraft memory leak?",
        "ai summarize",
        "ai diagnose [paste log here]",
        "ai status",
        "ai stats",
      ],
      userPermissions: [],
      botPermissions: [],
      enabledSlash: true,
      slashData: {
        name: "ai",
        description: "HelzerX Technologies AI intelligence and management suite",
        options: [
          {
            name: "ask",
            description: "Ask HelzerX AI any technical, coding, hosting, or general question",
            type: 1, // Subcommand
            options: [
              {
                name: "question",
                description: "Your question or prompt (English, Sinhala, or Singlish supported)",
                type: 3, // String
                required: true,
              },
            ],
          },
          {
            name: "summarize",
            description: "Generate a smart 3-bullet AI summary of the current ticket",
            type: 1, // Subcommand
          },
          {
            name: "diagnose",
            description: "Diagnose a Minecraft crash report, Linux server error, or stack trace",
            type: 1, // Subcommand
            options: [
              {
                name: "log",
                description: "Paste error text or crash report",
                type: 3, // String
                required: true,
              },
            ],
          },
          {
            name: "sentiment",
            description: "Analyze customer sentiment, urgency, and priority score for this ticket",
            type: 1, // Subcommand
          },
          {
            name: "status",
            description: "Check AI model readiness, latency, and capabilities",
            type: 1, // Subcommand
          },
          {
            name: "stats",
            description: "View AI ticket handling analytics and tool executions",
            type: 1, // Subcommand
          },
          {
            name: "takeover",
            description: "Pause AI automation for human staff takeover",
            type: 1, // Subcommand
            options: [
              {
                name: "ticket_id",
                description: "Ticket ID (optional if executed inside ticket channel)",
                type: 3,
                required: false,
              },
            ],
          },
          {
            name: "resume",
            description: "Resume AI automated ticket responses after staff takeover",
            type: 1, // Subcommand
            options: [
              {
                name: "ticket_id",
                description: "Ticket ID (optional if executed inside ticket channel)",
                type: 3,
                required: false,
              },
            ],
          },
        ],
      },
    });
  }

  async execute({ ctx, args }) {
    const db = ctx.client.db;
    const isSlash = ctx.isSlash;
    const subcommand = isSlash
      ? ctx.interaction.options.getSubcommand(false) || "status"
      : String(args?.[0] || "status").toLowerCase();

    // 1. ASK / QUESTION (ChatGPT / Gemini direct prompt in tickets or server)
    if (subcommand === "ask") {
      const question = isSlash
        ? ctx.interaction.options.getString("question")
        : args.slice(1).join(" ");

      if (!question) {
        return ctx.reply({
          components: [build("HelzerX AI Assistant", "Please provide a question. Example: `/ai ask What is the best Minecraft Paper garbage collector flag?`")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      await ctx.channel?.sendTyping?.();
      const res = await askGeminiDirect({ question, model: config.ai.model });

      if (res.error) {
        return ctx.reply({
          components: [build("HelzerX AI Notice", "Unable to complete request: " + res.error)],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      return ctx.reply({
        components: [build("HelzerX AI Response", res.text.slice(0, 3900))],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // 2. SUMMARIZE TICKET
    if (subcommand === "summarize") {
      const ticket = await db.getTicketByChannelAny(ctx.channel.id);
      if (!ticket) {
        return ctx.reply({
          components: [build("AI Summarizer", "This command can only be used inside a Discord ticket channel.")],
          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });
      }

      await ctx.channel?.sendTyping?.();
      const recent = await ctx.channel.messages.fetch({ limit: 30 }).catch(() => new Map());
      const ordered = [...recent.values()].reverse();
      const historyText = ordered
        .filter((m) => m.content?.trim())
        .map((m) => `${m.author.username}: ${m.content}`)
        .join("\n");

      const res = await summarizeTicket({ historyText, ticketId: ticket.ticketId });

      return ctx.reply({
        components: [build(`Ticket Summary — ${ticket.ticketId}`, res.text || "Summary generation in progress.")],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // 3. DIAGNOSE CRASH LOG
    if (subcommand === "diagnose") {
      const logText = isSlash
        ? ctx.interaction.options.getString("log")
        : args.slice(1).join(" ");

      if (!logText) {
        return ctx.reply({
          components: [build("AI Diagnostics", "Please provide crash log text or error details.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      await ctx.channel?.sendTyping?.();
      const res = await diagnoseCrashLog({ logText });

      return ctx.reply({
        components: [build("HelzerX Crash Diagnostics", res.text || "Diagnostic scan complete.")],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // 4. SENTIMENT & PRIORITY
    if (subcommand === "sentiment") {
      const ticket = await db.getTicketByChannelAny(ctx.channel.id);
      const recent = await ctx.channel.messages.fetch({ limit: 10 }).catch(() => new Map());
      const customerMsgs = [...recent.values()].filter((m) => !m.author.bot && m.content?.trim());
      const lastText = customerMsgs[0]?.content || "Ticket inquiry";

      const analysis = await analyzeSentiment({ text: lastText });

      if (ticket) {
        await db.updateTicket(ticket.ticketId, {
          "aiStats.priority": analysis.priority || "normal",
        }).catch(() => {});
      }

      return ctx.reply({
        components: [build("Customer Sentiment & Urgency Assessment", [
          `• Detected Sentiment: **${analysis.sentiment || "Neutral"}**`,
          `• Urgency Level: **${analysis.urgency || "Normal"}**`,
          `• Recommended Priority: **${(analysis.priority || "normal").toUpperCase()}**`,
          `• Confidence: **${analysis.confidence || 85}%**`,
        ].join("\n"))],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // 5. STATS
    if (subcommand === "stats") {
      const stats = await db.getAIStats(ctx.guild.id);
      return ctx.reply({
        components: [build("HelzerX AI Analytics", [
          "AI messages: **" + stats.messages + "**",
          "Tool calls: **" + stats.toolCalls + "**",
          "Audited actions: **" + stats.audits + "**",
          "Escalated tickets: **" + stats.escalated + "**",
        ].join("\n"))],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // 6. TAKEOVER / RESUME
    if (subcommand === "takeover" || subcommand === "resume") {
      let ticketId = isSlash
        ? ctx.interaction.options.getString("ticket_id")
        : String(args?.[1] || "");

      if (!ticketId) {
        const currentTicket = await db.getTicketByChannelAny(ctx.channel.id);
        if (currentTicket) ticketId = currentTicket.ticketId;
      }

      if (!ticketId) return ctx.reply("Please specify a ticket ID or execute inside a ticket channel.");

      const ticket = await db.getTicket(ticketId);
      if (!ticket || ticket.guildId !== ctx.guild.id) return ctx.reply("Ticket not found in this server.");

      await db.updateTicket(ticketId, {
        "aiStats.humanTakeover": subcommand === "takeover",
        "aiStats.escalated": subcommand === "takeover",
      });

      return ctx.reply({
        components: [build(
          "AI " + (subcommand === "takeover" ? "Human Takeover" : "Resumed"),
          "AI handling is now **" + (subcommand === "takeover" ? "paused for staff takeover" : "resumed") + "** for `" + ticketId + "`."
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // 7. ENABLE / DISABLE
    if (subcommand === "enable" || subcommand === "disable") {
      const enabled = subcommand === "enable";
      await db.updateGuild(ctx.guild.id, {
        "aiSupport.enabled": enabled,
        "aiSupport.autoActions": enabled,
      });
      return ctx.reply({
        components: [build("AI Support Configuration", "HelzerX Technologies AI support is now **" + (enabled ? "enabled" : "disabled") + "** for this server.")],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // 8. STATUS (Default)
    const guild = await db.getGuild(ctx.guild.id);
    const enabled = guild?.aiSupport?.enabled !== false;
    const model = guild?.aiSupport?.model || ctx.client.config.ai.model;
    const autoActions = guild?.aiSupport?.autoActions !== false;

    return ctx.reply({
      components: [build(
        "HelzerX Technologies AI Operations",
        [
          "Status: **" + (enabled ? "Online & Active" : "Disabled") + "**",
          "Model: **" + model + "**",
          "Multimodal Vision: **Active (Image & Crash log diagnosis)**",
          "Multilingual: **English, Sinhala (සිංහල), Singlish**",
          "Automatic actions: **" + (autoActions ? "Enabled" : "Disabled") + "**",
          "",
          "**Commands:**",
          "• `/ai ask <question>` — Ask anything (coding, setup, pricing)",
          "• `/ai summarize` — 3-bullet ticket transcript summary",
          "• `/ai diagnose <log>` — Instant crash log analysis & fix",
          "• `/ai sentiment` — Customer urgency & priority detector",
          "• `/ai takeover` / `/ai resume` — Staff AI handoff controls",
        ].join("\n"),
      )],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}

export default new AICommand();

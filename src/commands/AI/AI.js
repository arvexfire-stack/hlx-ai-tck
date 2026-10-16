import { Command } from "#structures/classes/Command";
import { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags } from "discord.js";

const build = (title, body) => new ContainerBuilder()
  .addTextDisplayComponents(new TextDisplayBuilder().setContent("## " + title + "\n\n" + body));

class AICommand extends Command {
  constructor() {
    super({
      name: "ai",
      description: "Manage HelzerX AI support",
      usage: "ai <status|enable|disable|stats|takeover|resume> [ticket]",
      examples: ["ai status", "ai enable", "ai disable", "ai stats"],
      userPermissions: [PermissionFlagsBits.ManageGuild],
      botPermissions: [],
      enabledSlash: false,
    });
  }

  async execute({ ctx, args }) {
    const action = String(args?.[0] || "status").toLowerCase();
    const db = ctx.client.db;

    if (action === "enable" || action === "disable") {
      const enabled = action === "enable";
      await db.updateGuild(ctx.guild.id, {
        "aiSupport.enabled": enabled,
        "aiSupport.autoActions": enabled,
      });
      return ctx.reply({
        components: [build("AI Support Updated", "HelzerX Studio AI support is now **" + (enabled ? "enabled" : "disabled") + "** for this server.")],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (action === "stats") {
      const stats = await db.getAIStats(ctx.guild.id);
      return ctx.reply({ components: [build("AI Support Analytics", [
        "AI messages: **" + stats.messages + "**",
        "Tool calls: **" + stats.toolCalls + "**",
        "Audited actions: **" + stats.audits + "**",
        "Escalated tickets: **" + stats.escalated + "**",
      ].join("\\n"))], flags: MessageFlags.IsComponentsV2 });
    }

    if (action === "takeover" || action === "resume") {
      const ticketId = String(args?.[1] || "");
      if (!ticketId) return ctx.reply("Please provide a ticket ID.");
      const ticket = await db.getTicket(ticketId);
      if (!ticket || ticket.guildId !== ctx.guild.id) return ctx.reply("Ticket not found in this server.");
      await db.updateTicket(ticketId, { "aiStats.humanTakeover": action === "takeover", "aiStats.escalated": action === "takeover" });
      return ctx.reply({ components: [build("AI " + (action === "takeover" ? "Takeover" : "Resumed"), "AI handling is now **" + (action === "takeover" ? "paused for staff" : "resumed") + "** for `" + ticketId + "`.")], flags: MessageFlags.IsComponentsV2 });
    }

    if (action === "status") {
      const guild = await db.getGuild(ctx.guild.id);
      const enabled = guild?.aiSupport?.enabled !== false;
      const model = guild?.aiSupport?.model || ctx.client.config.ai.model;
      const autoActions = guild?.aiSupport?.autoActions !== false;

      return ctx.reply({
        components: [build(
          "HelzerX AI Support",
          [
            "Status: **" + (enabled ? "Enabled" : "Disabled") + "**",
            "Model: **" + model + "**",
            "Automatic actions: **" + (autoActions ? "Enabled" : "Disabled") + "**",
            "",
            "The AI can handle supported account, billing, payment, order, domain, Minecraft, AI-agent, rewards, VPS, and technical-support workflows when the corresponding service API is configured.",
          ].join("\n"),
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    return ctx.reply({
      components: [build("AI Support", "Usage: .ai status, .ai enable, or .ai disable.")],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}

export default new AICommand();

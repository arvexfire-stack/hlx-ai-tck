/**
 * Copyright (c) 2025 openUwU
 * Code by bre4d777
 * MIT License
 */

import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  MessageFlags,
  AllowedMentionsTypes
} from "discord.js";
import { emoji } from "#config/emoji"

export class TicketUI {
  static buildTicketPanel(ticket, category, addedUsers = []) {
    const container = new ContainerBuilder();
    const isOpen = ticket.status === "open";
    const focus = category.description || "Tell us what you need help with and our support team will assist you.";
    const welcomeMsg = category.settings?.welcomeMessage || "Thanks for reaching out to HelzerX Studio. Tell me what is happening and I’ll help you work through it.";
    const aiStatus = category.settings?.aiEnabled === false ? "Human Support" : ticket.aiStats?.humanTakeover ? "Human Staff Handling" : "AI Support Online";

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emoji.ticket} HelzerX Studio • ${category.name}\n\n${welcomeMsg}\n\n**Category Focus**\n${focus}\n\n**Ticket**\n> **ID:** \`#${ticket.ticketId.replace("ticket_", "").slice(-8)}\`\n> **Status:** ${isOpen ? "🟢 Open" : "🔒 Closed"}\n> **Support:** ${aiStatus}\n> **Creator:** <@${ticket.userId}>`
      )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${emoji.logs} Quick Resolution Guide\n\n• **Describe the issue:** Include the exact problem and what you expected.\n• **Technical issue:** Send screenshots, error messages, logs, or relevant configuration.\n• **Billing/service issue:** Include the service or order reference if available — never share passwords or payment secrets.\n• **Need a person?** Use **Claim** or ask the AI to escalate this ticket to staff.`
      )
    );

    if (isOpen) {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
      container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder().setCustomId(`ticket_add_user_${ticket.ticketId}`).setPlaceholder("Add a user to this ticket...").setMaxValues(1)
      ));

      if (addedUsers.length > 0) {
        const removeOptions = addedUsers.map(u => ({ label: u.username || `User ${u.userId}`, value: u.userId, description: `Added by ${u.addedByUsername || "Staff"}` }));
        container.addActionRowComponents(new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId(`ticket_remove_user_${ticket.ticketId}`).setPlaceholder("Remove a user from this ticket...").addOptions(removeOptions).setMaxValues(1)
        ));
      }

      const buttons = [new ButtonBuilder().setCustomId(`ticket_close_${ticket.ticketId}`).setEmoji(emoji.lock).setLabel("Close").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ticket_transcript_${ticket.ticketId}`).setEmoji("📄").setLabel("Transcript").setStyle(ButtonStyle.Secondary)];
      if (ticket.claimedBy) {
        buttons.push(new ButtonBuilder().setCustomId(`ticket_unclaim_${ticket.ticketId}`).setEmoji("↩️").setLabel("Unclaim").setStyle(ButtonStyle.Secondary));
      } else {
        buttons.push(new ButtonBuilder().setCustomId(`ticket_claim_${ticket.ticketId}`).setEmoji("👋").setLabel("Claim").setStyle(ButtonStyle.Success));
      }
      container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons));
    } else {
      container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_transcript_${ticket.ticketId}`).setEmoji("📄").setLabel("Transcript").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ticket_reopen_${ticket.ticketId}`).setEmoji(emoji.unlock).setLabel("Reopen").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`ticket_delete_${ticket.ticketId}`).setEmoji(emoji.trash).setLabel("Delete").setStyle(ButtonStyle.Danger)
      ));
    }
    return container;
  }
  static buildStaffEscalation({ reason, priority = "normal", ticketId, customerId, staffRoles = [] }) {
    const container = new ContainerBuilder();
    const roleMentions = staffRoles.length ? staffRoles.map((roleId) => "<@&" + roleId + ">").join(" ") : "Support Staff";
    const priorityLabel = String(priority).toUpperCase();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "## Human Support Required\n\n" +
        roleMentions + "\n\n" +
        "**Priority:** " + priorityLabel + "\n" +
        "**Customer:** <@" + customerId + ">\n" +
        "**Ticket:** `" + ticketId + "`\n\n" +
        "**Reason**\n" + reason + "\n\n" +
        "HelzerX Studio AI has paused automated handling for this ticket. A staff member should review and continue the conversation."
      )
    );

    return container;
  }

  static buildRatingRequest(ticketId, userId) {
    const container = new ContainerBuilder();
    
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Rate Your Experience\n\n<@${userId}>, please rate your support experience:`
      )
    );
    
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ticket_rate_${ticketId}`)
          .setPlaceholder("⭐ Rate your experience")
          .addOptions([
            { label: "⭐ 1 Star - Very Poor", value: "1", emoji: "😞" },
            { label: "⭐⭐ 2 Stars - Poor", value: "2", emoji: "😕" },
            { label: "⭐⭐⭐ 3 Stars - Average", value: "3", emoji: "😐" },
            { label: "⭐⭐⭐⭐ 4 Stars - Good", value: "4", emoji: "🙂" },
            { label: "⭐⭐⭐⭐⭐ 5 Stars - Excellent", value: "5", emoji: "😄" },
          ])
      )
    );

    return container;
  }

  static buildError(title, message) {
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emoji.cross} ${title}\n\n${message}`)
    );
    return container;
  }

  static buildSuccess(title, message) {
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emoji.check} ${title}\n\n${message}`)
    );
    return container;
  }

  static buildWarning(title, message) {
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emoji.logs}   ${title}\n\n${message}`)
    );
    return container;
  }

  static buildInfo(title, message) {
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`##  ${title}\n\n${message}`)
    );
    return container;
  }

  static buildConfirmation(title, message, confirmId, cancelId, confirmLabel = "Confirm", confirmStyle = ButtonStyle.Danger) {
    const container = new ContainerBuilder();
    
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}\n\n${message}`)
    );
    
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(confirmId)
          .setLabel(confirmLabel)
          .setStyle(confirmStyle),
        new ButtonBuilder()
          .setCustomId(cancelId)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary)
      )
    );

    return container;
  }

  static buildLogEmbed(title, data) {
    const container = new ContainerBuilder();
    
    let content = `## ${title}\n\n`;
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) {
        content += `**${key}:** ${value}\n`;
      }
    }
    
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content)
    );

    return container;
  }

  static getFlags() {
    return MessageFlags.IsComponentsV2;
  }
  

  static getEphemeralFlags() {
    return MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
  }
}

export default TicketUI;
// slice of bread

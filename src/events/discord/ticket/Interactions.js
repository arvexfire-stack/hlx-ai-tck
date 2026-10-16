/**
 * Copyright (c) 2025 openUwU
 * Code by bre4d777
 * MIT License
 */

import {
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize
} from "discord.js";
import { logger } from "#utils/logger";
import TicketUI from "#structures/classes/TicketUI";
import * as discordTranscripts from "discord-html-transcripts";
import { emoji } from "#config/emoji"

export default {
  name: "interactionCreate",

  async execute({ eventArgs, client }) {
    const [interaction] = eventArgs;

    if (!interaction.isMessageComponent()) return;

    const handlers = {
      ticket_create: handleTicketCreate,
      ticket_close: handleTicketClose,
      ticket_claim: handleTicketClaim,
      ticket_unclaim: handleTicketUnclaim,
      ticket_transcript: handleTicketTranscript,
      ticket_add_user: handleTicketAddUser,
      ticket_remove_user: handleTicketRemoveUser,
      ticket_rate: handleTicketRate,
      ticket_reopen: handleTicketReopen,
      ticket_delete: handleTicketDelete,
      confirm_reopen: handleConfirmReopen,
      cancel_reopen: handleCancelReopen,
      confirm_delete: handleConfirmDelete,
      cancel_delete: handleCancelDelete,
    };

    for (const [key, handler] of Object.entries(handlers)) {
      if (interaction.customId === key || interaction.customId.startsWith(`${key}_`)) {
        try {
          await handler(interaction, client);
        } catch (error) {
          logger.error("Interaction", `${key} failed`, error);
          await interaction.reply({
            components: [TicketUI.buildError("Error", "An unexpected error occurred.")],
            flags: TicketUI.getEphemeralFlags()
          }).catch(() => {});
        }
        return;
      }
    }
  },
};

async function handleTicketCreate(interaction, client) {
  await interaction.deferReply({ flags: TicketUI.getEphemeralFlags() });

  const categoryId = interaction.values[0];
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  const panels = await client.db.getGuildPanels(guildId);
  const panel = panels.find(p => p.categories.some(c => c.categoryId === categoryId));

  if (!panel) {
    return interaction.editReply({
      components: [TicketUI.buildError("Panel Not Found", "The ticket panel could not be located.")],
      flags: TicketUI.getFlags()
    });
  }

  const category = panel.categories.find(c => c.categoryId === categoryId);

  if (!category || !category.isActive) {
    return interaction.editReply({
      components: [TicketUI.buildWarning("Category Unavailable", "This ticket category is currently disabled or does not exist.")],
      flags: TicketUI.getFlags()
    });
  }

  const isBlacklisted = await client.db.isUserBlacklisted(guildId, userId);
  if (isBlacklisted) {
    return interaction.editReply({
      components: [TicketUI.buildError("Access Denied", "You are blacklisted from creating tickets in this server.")],
      flags: TicketUI.getFlags()
    });
  }

  const openTickets = await client.db.getUserCategoryOpenTickets(guildId, userId, categoryId);

  if (openTickets.length >= category.settings.maxTicketsPerUser) {
    return interaction.editReply({
      components: [TicketUI.buildWarning(
        "Maximum Tickets Reached",
        `You already have **${category.settings.maxTicketsPerUser}** open ticket(s) in this category.\n\nPlease close an existing ticket before creating a new one.`
      )],
      flags: TicketUI.getFlags()
    });
  }

  await client.db.createTicket(guildId, panel.panelId, categoryId, userId);

  await interaction.editReply({
    components: [TicketUI.buildSuccess("Ticket Creating", "Your ticket is being created. You will be notified shortly.")],
    flags: TicketUI.getFlags()
  });
}

async function handleTicketClaim(interaction, client) {
  await interaction.deferUpdate();

  const ticketId = interaction.customId.replace("ticket_claim_", "");
  const ticket = await client.db.getTicket(ticketId);
  if (!ticket) {
    return interaction.followUp({
      components: [TicketUI.buildError("Ticket Not Found", "This ticket could not be located.")],
      flags: TicketUI.getEphemeralFlags(),
    });
  }

  if (ticket.status !== "open") {
    return interaction.followUp({
      components: [TicketUI.buildWarning("Ticket Closed", "Closed tickets cannot be claimed.")],
      flags: TicketUI.getEphemeralFlags(),
    });
  }

  const canClaim = await checkPermissions(interaction, client, ticket, "claim");
  if (!canClaim) {
    return interaction.followUp({
      components: [TicketUI.buildError("Staff Only", "Only an authorized support staff member can claim this ticket.")],
      flags: TicketUI.getEphemeralFlags(),
    });
  }

  const claimed = await client.db.claimTicket(ticketId, interaction.user.id);
  if (!claimed) {
    const current = await client.db.getTicket(ticketId);
    return interaction.followUp({
      components: [TicketUI.buildWarning("Already Claimed", current?.claimedBy ? `This ticket is already being handled by <@${current.claimedBy}>.` : "This ticket is already being handled by another staff member.")],
      flags: TicketUI.getEphemeralFlags(),
    });
  }

  const panel = await client.db.getPanel(claimed.panelId);
  const category = panel?.categories?.find((item) => item.categoryId === claimed.categoryId);
  const addedUsers = await client.db.getAddedUsers(ticketId);
  const control = await interaction.channel.messages.fetch(claimed.controlMessageId).catch(() => null);
  if (control && category) {
    await control.edit({
      components: [TicketUI.buildTicketPanel(claimed, category, addedUsers)],
      flags: TicketUI.getFlags(),
    }).catch(() => {});
  }

  await interaction.followUp({
    content: `<@${claimed.userId}> — this ticket is now being handled by <@${interaction.user.id}>. AI automation is paused while staff is handling the conversation.`,
    allowedMentions: { users: [claimed.userId, interaction.user.id] },
  });
}

async function handleTicketTranscript(interaction, client) {
  const ticketId = interaction.customId.replace("ticket_transcript_", "");
  const ticket = await client.db.getTicket(ticketId);

  if (!ticket) {
    return interaction.reply({
      components: [TicketUI.buildError("Ticket Not Found", "This ticket could not be located.")],
      flags: TicketUI.getEphemeralFlags(),
    });
  }

  const canView = await checkPermissions(interaction, client, ticket, "transcript");
  if (!canView) {
    return interaction.reply({
      components: [TicketUI.buildError("Staff Only", "Only authorized support staff can generate a transcript.")],
      flags: TicketUI.getEphemeralFlags(),
    });
  }

  await interaction.deferReply({ flags: TicketUI.getEphemeralFlags() });

  try {
    const attachment = await discordTranscripts.createTranscript(interaction.channel, {
      limit: -1,
      filename: `helzerx-${ticket.ticketId}.html`,
      saveImages: false,
      poweredBy: false,
      footerText: "HelzerX Studio • Ticket Transcript",
    });

    await interaction.editReply({
      components: [TicketUI.buildSuccess(
        "Transcript Ready",
        "The complete ticket transcript has been generated below. It includes the conversation and ticket history."
      )],
      files: [attachment],
      flags: TicketUI.getEphemeralFlags(),
    });
  } catch (error) {
    logger.error("Transcript", `Failed for ${ticket.ticketId}`, error);
    await interaction.editReply({
      components: [TicketUI.buildError(
        "Transcript Failed",
        "I couldn't generate the transcript right now. Please try again or ask another staff member."
      )],
      flags: TicketUI.getFlags(),
    });
  }
}

async function handleTicketUnclaim(interaction, client) {
  await interaction.deferUpdate();

  const ticketId = interaction.customId.replace("ticket_unclaim_", "");
  const ticket = await client.db.getTicket(ticketId);
  if (!ticket) {
    return interaction.followUp({
      components: [TicketUI.buildError("Ticket Not Found", "This ticket could not be located.")],
      flags: TicketUI.getEphemeralFlags(),
    });
  }

  const canClaim = await checkPermissions(interaction, client, ticket, "claim");
  if (!canClaim) {
    return interaction.followUp({
      components: [TicketUI.buildError("Staff Only", "Only authorized support staff can release this ticket.")],
      flags: TicketUI.getEphemeralFlags(),
    });
  }

  if (ticket.claimedBy && ticket.claimedBy !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.followUp({
      components: [TicketUI.buildError("Claimed By Another Staff Member", `This ticket is currently handled by <@${ticket.claimedBy}>.`)],
      flags: TicketUI.getEphemeralFlags(),
    });
  }

  const updated = await client.db.unclaimTicket(ticketId);
  const panel = await client.db.getPanel(updated.panelId);
  const category = panel?.categories?.find((item) => item.categoryId === updated.categoryId);
  const addedUsers = await client.db.getAddedUsers(ticketId);
  const control = await interaction.channel.messages.fetch(updated.controlMessageId).catch(() => null);
  if (control && category) {
    await control.edit({
      components: [TicketUI.buildTicketPanel(updated, category, addedUsers)],
      flags: TicketUI.getFlags(),
    }).catch(() => {});
  }

  await interaction.followUp({
    content: `<@${updated.userId}> — staff handling has been released. AI support is available again for this ticket.`,
    allowedMentions: { users: [updated.userId] },
  });
}

async function checkPermissions(interaction, client, ticket, action) {
  const panel = await client.db.getPanel(ticket.panelId);
  if (!panel) return false;

  const category = panel.categories.find(c => c.categoryId === ticket.categoryId);
  if (!category) return false;

  const staffRoles = await client.db.getStaffRoles(interaction.guild.id);
  const hasStaffRole = interaction.member.roles.cache.some(r => staffRoles.includes(r.id));
  const hasSupportRole = interaction.member.roles.cache.some(r => category.supportRoles.includes(r.id));
  const isTicketOwner = interaction.user.id === ticket.userId;
  const hasManageChannels = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

  if (action === "close") {
    return hasManageChannels || hasStaffRole || hasSupportRole || (category.settings.userCanClose && isTicketOwner);
  }

  return hasManageChannels || hasStaffRole || hasSupportRole;
}

async function getTicketFromChannel(interaction, client) {
  const ticket = await client.db.getTicketByChannelAny(interaction.channelId);

  if (!ticket) {
    await interaction.reply({
      components: [TicketUI.buildError("Invalid Channel", "This is not a ticket channel.")],
      flags: TicketUI.getEphemeralFlags()
    });
    return null;
  }

  return ticket;
}

async function handleTicketClose(interaction, client) {
  const ticket = await getTicketFromChannel(interaction, client);
  if (!ticket) return;

  if (ticket.status === "closed") {
    return interaction.reply({
      components: [TicketUI.buildWarning("Already Closed", "This ticket is already closed.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  const canClose = await checkPermissions(interaction, client, ticket, "close");

  if (!canClose) {
    return interaction.reply({
      components: [TicketUI.buildError("Permission Denied", "You don't have permission to close this ticket.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`close_modal_${ticket.ticketId}`)
    .setTitle("Close Ticket");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Reason for closing (optional)")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Provide a reason for closing this ticket...")
        .setMaxLength(500)
        .setRequired(false)
    )
  );

  await interaction.showModal(modal);

  try {
    const modalSubmit = await interaction.awaitModalSubmit({
      filter: (i) => i.customId === `close_modal_${ticket.ticketId}` && i.user.id === interaction.user.id,
      time: 120_000,
    });

    await modalSubmit.deferUpdate();

    const reason = modalSubmit.fields.getTextInputValue("reason")?.trim() || null;
    await client.db.closeTicket(ticket.ticketId, interaction.user.id, reason);

    await modalSubmit.followUp({
      components: [TicketUI.buildSuccess("Ticket Closed", "The ticket has been closed successfully.")],
      flags: TicketUI.getEphemeralFlags()
    });
  } catch (e) {
    logger.debug("Interaction", "Modal timeout for ticket close");
  }
}

async function handleTicketAddUser(interaction, client) {
  await interaction.deferUpdate();

  const ticketId = interaction.customId.replace("ticket_add_user_", "");
  const userId = interaction.values[0];

  const ticket = await client.db.getTicket(ticketId);
  if (!ticket) {
    return interaction.followUp({
      components: [TicketUI.buildError("Ticket Not Found", "The ticket could not be located.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  if (ticket.status === "closed") {
    return interaction.followUp({
      components: [TicketUI.buildWarning("Ticket Closed", "Cannot add users to a closed ticket.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  const canAdd = await checkPermissions(interaction, client, ticket, "add");

  if (!canAdd) {
    return interaction.followUp({
      components: [TicketUI.buildError("Permission Denied", "You don't have permission to add users to this ticket.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  if (userId === ticket.userId) {
    return interaction.followUp({
      components: [TicketUI.buildWarning("Invalid User", "The ticket creator is already part of this ticket.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  const addedUsers = await client.db.getAddedUsers(ticketId);
  if (addedUsers.length >= 5) {
    return interaction.followUp({
      components: [TicketUI.buildWarning("Maximum Users Reached", "A maximum of 5 users can be added to a ticket.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  const isAlreadyAdded = await client.db.isUserAdded(ticketId, userId);
  if (isAlreadyAdded) {
    return interaction.followUp({
      components: [TicketUI.buildInfo("User Already Added", "This user already has access to the ticket.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  await client.db.addTicketUser(ticketId, userId, interaction.user.id);
    const addedcontainer = new ContainerBuilder();
    addedcontainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${emoji.add} User Added\n\n<@${userId}> has been granted access to this ticket`))
  await interaction.followUp({
    components: [addedcontainer],
    flags: TicketUI.getEphemeralFlags()
  });
}

async function handleTicketRemoveUser(interaction, client) {
  await interaction.deferUpdate();

  const ticketId = interaction.customId.replace("ticket_remove_user_", "");
  const userId = interaction.values[0];

  const ticket = await client.db.getTicket(ticketId);
  if (!ticket) {
    return interaction.followUp({
      components: [TicketUI.buildError("Ticket Not Found", "The ticket could not be located.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  if (ticket.status === "closed") {
    return interaction.followUp({
      components: [TicketUI.buildWarning("Ticket Closed", "Cannot remove users from a closed ticket.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  const canRemove = await checkPermissions(interaction, client, ticket, "remove");

  if (!canRemove) {
    return interaction.followUp({
      components: [TicketUI.buildError("Permission Denied", "You don't have permission to remove users from this ticket.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  await client.db.removeTicketUser(ticketId, userId, interaction.user.id);
   const removedcontainer = new ContainerBuilder();
     removedcontainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${emoji.remove} User Removed\n\n<@${userId}> has been removed from this ticket`))
  await interaction.followUp({
    components: [removedcontainer],
    flags: TicketUI.getEphemeralFlags()
  });
}

async function handleTicketRate(interaction, client) {
  const ticketId = interaction.customId.replace("ticket_rate_", "");
  const stars = parseInt(interaction.values[0]);

  const ticket = await client.db.getTicket(ticketId);

  if (!ticket) {
    return interaction.reply({
      components: [TicketUI.buildError("Ticket Not Found", "The ticket could not be located.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  if (interaction.user.id !== ticket.userId) {
    return interaction.reply({
      components: [TicketUI.buildError("Permission Denied", "Only the ticket creator can provide a rating.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  if (ticket.rating?.stars) {
    return interaction.reply({
      components: [TicketUI.buildInfo("Already Rated", "You have already submitted a rating for this ticket.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`rate_modal_${ticketId}_${stars}`)
    .setTitle("Rate Your Experience");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("feedback")
        .setLabel("Additional feedback (optional)")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Share your experience with our support team...")
        .setMaxLength(1000)
        .setRequired(false)
    )
  );

  await interaction.showModal(modal);

  try {
    const modalSubmit = await interaction.awaitModalSubmit({
      filter: (i) => i.customId === `rate_modal_${ticketId}_${stars}` && i.user.id === interaction.user.id,
      time: 300_000,
    });

    await modalSubmit.deferUpdate();

    const feedback = modalSubmit.fields.getTextInputValue("feedback")?.trim() || null;
    await client.db.rateTicket(ticketId, stars, feedback);

    await modalSubmit.followUp({
      components: [TicketUI.buildSuccess("Thank You!", "Your feedback has been recorded and helps us improve our support services.")],
      flags: TicketUI.getEphemeralFlags()
    });
  } catch (e) {
    logger.debug("Interaction", "Modal timeout for ticket rating");
  }
}

async function handleTicketReopen(interaction, client) {
  const ticket = await getTicketFromChannel(interaction, client);
  if (!ticket) return;

  if (ticket.status === "open") {
    return interaction.reply({
      components: [TicketUI.buildInfo("Already Open", "This ticket is already open.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  const canReopen = await checkPermissions(interaction, client, ticket, "reopen");

  if (!canReopen) {
    return interaction.reply({
      components: [TicketUI.buildError("Permission Denied", "You don't have permission to reopen this ticket.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  await interaction.reply({
    components: [TicketUI.buildConfirmation(
      `${emoji.unlock} Reopen Ticket`,
      "Are you sure you want to reopen this ticket? This will restore full access and allow continued support.",
      `confirm_reopen_${ticket.ticketId}`,
      `cancel_reopen_${ticket.ticketId}`,
      "Confirm Reopen",
      "Success"
    )],
    flags: TicketUI.getEphemeralFlags()
  });
}

async function handleConfirmReopen(interaction, client) {
  await interaction.deferUpdate();
  const ticketId = interaction.customId.replace("confirm_reopen_", "");

  const ticket = await client.db.getTicket(ticketId);

  if (!ticket) {
    return interaction.editReply({
      components: [TicketUI.buildError("Ticket Not Found", "The ticket could not be located.")],
      flags: TicketUI.getFlags()
    });
  }

  if (ticket.status === "open") {
    return interaction.editReply({
      components: [TicketUI.buildInfo("Already Open", "This ticket is already open.")],
      flags: TicketUI.getFlags()
    });
  }

  await client.db.reopenTicket(ticketId);

  await interaction.editReply({
    components: [TicketUI.buildSuccess("Ticket Reopened", "The ticket has been successfully reopened and is now active.")],
    flags: TicketUI.getFlags()
  });
}

async function handleCancelReopen(interaction, client) {
  await interaction.update({
    components: [TicketUI.buildInfo("Action Cancelled", "The reopen request has been cancelled.")],
    flags: TicketUI.getFlags()
  });
}

async function handleTicketDelete(interaction, client) {
  const ticket = await getTicketFromChannel(interaction, client);
  if (!ticket) return;

  const canDelete = await checkPermissions(interaction, client, ticket, "delete");

  if (!canDelete) {
    return interaction.reply({
      components: [TicketUI.buildError("Permission Denied", "You don't have permission to delete this ticket.")],
      flags: TicketUI.getEphemeralFlags()
    });
  }

  await interaction.reply({
    components: [TicketUI.buildConfirmation(
      `${emoji.logs} Delete Ticket`,
      "This will **permanently delete** the ticket channel and all its contents.\n\n**This action cannot be undone!**\n\nAre you absolutely sure?",
      `confirm_delete_${ticket.ticketId}`,
      `cancel_delete_${ticket.ticketId}`,
      "Confirm Delete"
    )],
    flags: TicketUI.getEphemeralFlags()
  });
}

async function handleConfirmDelete(interaction, client) {
  await interaction.deferUpdate();
  const ticketId = interaction.customId.replace("confirm_delete_", "");
  const ticket = await client.db.getTicket(ticketId);

  if (!ticket) {
    return interaction.editReply({
      components: [TicketUI.buildError("Ticket Not Found", "The ticket could not be located.")],
      flags: TicketUI.getFlags()
    });
  }

  const panel = await client.db.getPanel(ticket.panelId);

  await client.db.deleteTicket(ticketId);

  await interaction.editReply({
    components: [TicketUI.buildSuccess("Ticket Deleted", "The ticket channel will be deleted momentarily.")],
    flags: TicketUI.getFlags()
  });
}

async function handleCancelDelete(interaction, client) {
  await interaction.update({
    components: [TicketUI.buildInfo("Action Cancelled", "The delete request has been cancelled.")],
    flags: TicketUI.getFlags()
  });
}
// kneaded logic

/**
 * Copyright (c) 2025 openUwU
 * Code by bre4d777
 * MIT License
 */

import { Command } from "#structures/classes/Command";
import {
  PermissionFlagsBits,
  MessageFlags,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
} from "discord.js";
import { logger } from "#utils/logger";
import { emoji } from "#config/emoji"
class PanelCommand extends Command {
  constructor() {
    super({
      name: "panel",
      description: "Manage ticket panel",
      usage: "panel",
      examples: ["panel"],
      userPermissions: [PermissionFlagsBits.ManageGuild],
      botPermissions: [PermissionFlagsBits.ManageChannels],
      enabledSlash: true,
      slashData: {
        name: "panel",
        description: "Manage ticket panel",
        defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
      },
    });
    this.state = {};
  }

  async execute({ ctx }) {
    const db = ctx.client.db;
    const panels = await db.getGuildPanels(ctx.guild.id);
    const panel = panels[0];

    this.state[ctx.guild.id] = {
      view: panel ? "MAIN" : "CREATE",
      panelId: panel?.panelId,
      temp: {},
      page: 0,
    };

    const c = await this._render(ctx, this.state[ctx.guild.id], db);
    const msg = await ctx.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    this._collector(ctx, msg, db);
  }

  async _render(ctx, st, db) {
    if (st.view === "CREATE") return this._create(ctx);
    if (st.view === "MAIN") return await this._main(ctx, st, db);
    if (st.view === "CATEGORIES") return await this._categories(ctx, st, db);
    if (st.view === "CATEGORY_EDIT") return await this._categoryEdit(ctx, st, db);
    if (st.view === "CATEGORY_ROLES") return await this._categoryRoles(ctx, st, db);
    if (st.view === "CATEGORY_SETTINGS") return await this._categorySettings(ctx, st, db);
    if (st.view === "CATEGORY_CHANNEL") return this._categoryChannel(ctx, st,db)
    if (st.view === "LOGS") return await this._logs(ctx, st, db);
    if (st.view === "SEND") return this._send(ctx, st);
  }

  _create(ctx) {
    const c = new ContainerBuilder();
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${emoji.cross}Create Panel\n\nNo panel exists for this server`));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("create_panel").setLabel("Create Panel").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("panel_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
    ));
    return c;
  }

  async _main(ctx, st, db) {
    const p = await db.getPanel(st.panelId);
    if (!p) return new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`Panel not found`));

    const activeCats = p.categories.filter(cat => cat.isActive).length;
    const statusText = p.isActive ? "Active" : "Inactive";

    const c = new ContainerBuilder();
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${emoji.dashboard} ${p.name}\n\nStatus: ${statusText}\nCategories: ${activeCats}/${p.categories.length} active`));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    c.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("panel_name").setLabel("Edit Name").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("panel_message").setLabel("Edit Message").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("panel_placeholder").setLabel("Edit Placeholder").setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("panel_status").setLabel(p.isActive ? "Disable Panel" : "Enable Panel").setStyle(p.isActive ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId("panel_categories").setLabel("Manage Categories").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("panel_logs").setLabel("Configure Logs").setStyle(ButtonStyle.Primary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("panel_send").setLabel("Send Panel").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("panel_delete").setLabel("Delete Panel").setStyle(ButtonStyle.Danger)
      )
    );

    return c;
  }

  async _categories(ctx, st, db) {
    const p = await db.getPanel(st.panelId);
    if (!p) return new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`Panel not found`));

    const cats = p.categories;
    const c = new ContainerBuilder();
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Categories\n\n${cats.length}/25 categories created`));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    if (cats.length > 0) {
      const opts = cats.map(cat => ({
        label: cat.name.substring(0, 100),
        value: cat.categoryId,
        description: cat.isActive ? `Active - ${cat.supportRoles.length} roles` : `Inactive - ${cat.supportRoles.length} roles`
      }));

      c.addActionRowComponents(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId("cat_select").setPlaceholder("Select category to edit").addOptions(opts)
      ));
      c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    } else {
      c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`No categories found. Add one to get started.`));
      c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    }

    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cat_add").setLabel("Add Category").setStyle(ButtonStyle.Success).setDisabled(cats.length >= 25),
      new ButtonBuilder().setCustomId("panel_back").setLabel("Back to Main").setStyle(ButtonStyle.Secondary)
    ));

    return c;
  }

  async _categoryEdit(ctx, st, db) {
    const p = await db.getPanel(st.panelId);
    if (!p) return new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`Panel not found`));

    const cat = p.categories.find(c => c.categoryId === st.temp.catId);
    if (!cat) return new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`Category not found`));

    const statusText = cat.isActive ? "Active" : "Inactive";
    const desc = cat.description || "No description set";
    const emojiDisplay = cat.emoji || "No emoji set";
    const categoryChannel = cat.ticketChannelCategory ? `<#${cat.ticketChannelCategory}>` : "Not set";

    const c = new ContainerBuilder();
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Edit: ${cat.name}\n\nStatus: ${statusText}\nEmoji: ${emojiDisplay}\nDescription: ${desc}\nTicket Category: ${categoryChannel}`));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    c.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("cat_name").setLabel("Edit Name").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("cat_desc").setLabel("Edit Description").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("cat_emoji").setLabel("Edit Emoji").setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("cat_roles").setLabel("Support Roles").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("cat_channel").setLabel("Ticket Category").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("cat_naming").setLabel("Naming Format").setStyle(ButtonStyle.Primary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("cat_settings").setLabel("Settings").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("cat_welcome").setLabel("Welcome Message").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("cat_status").setLabel(cat.isActive ? "Disable" : "Enable").setStyle(cat.isActive ? ButtonStyle.Danger : ButtonStyle.Success)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("cat_delete").setLabel("Delete Category").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("cat_back").setLabel("Back to Categories").setStyle(ButtonStyle.Secondary)
      )
    );

    return c;
  }

  async _categoryRoles(ctx, st, db) {
    const p = await db.getPanel(st.panelId);
    const cat = p.categories.find(c => c.categoryId === st.temp.catId);
    if (!cat) return new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`Category not found`));

    const rolesText = cat.supportRoles.length ? cat.supportRoles.map(r => `<@&${r}>`).join(" ") : "No support roles assigned";

    const c = new ContainerBuilder();
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Support Roles: ${cat.name}\n\n${rolesText}`));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("cat_roles_select")
        .setPlaceholder("Select support roles (up to 10)")
        .setMinValues(0)
        .setMaxValues(10)
    ));

    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cat_back_edit").setLabel("Back to Category").setStyle(ButtonStyle.Secondary)
    ));

    return c;
  }

  async _categorySettings(ctx, st, db) {
    const p = await db.getPanel(st.panelId);
    const cat = p.categories.find(c => c.categoryId === st.temp.catId);
    if (!cat) return new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`Category not found`));

    const s = cat.settings;
    const settingsText = `**Settings for ${cat.name}**\n\nPing User: ${s.pingUser ? emoji.check : emoji.cross }\nPing Roles: ${s.pingRole ? emoji.check : emoji.cross}\nUser Can Close: ${s.userCanClose ? emoji.check : emoji.cross}\nDM on Open: ${s.dmUserOnOpen ? emoji.check : emoji.cross}\nDM on Close: ${s.dmUserOnClose ? emoji.check : emoji.cross}\nMax Tickets Per User: ${s.maxTicketsPerUser}`;

    const c = new ContainerBuilder();
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(settingsText));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    c.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("cs_pu").setLabel(`Ping User: ${s.pingUser ? "ON" : "OFF"}`).setStyle(s.pingUser ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("cs_pr").setLabel(`Ping Role: ${s.pingRole ? "ON" : "OFF"}`).setStyle(s.pingRole ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("cs_uc").setLabel(`User Close: ${s.userCanClose ? "ON" : "OFF"}`).setStyle(s.userCanClose ? ButtonStyle.Success : ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("cs_do").setLabel(`DM Open: ${s.dmUserOnOpen ? "ON" : "OFF"}`).setStyle(s.dmUserOnOpen ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("cs_dc").setLabel(`DM Close: ${s.dmUserOnClose ? "ON" : "OFF"}`).setStyle(s.dmUserOnClose ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("cs_max").setLabel(`Max: ${s.maxTicketsPerUser}`).setStyle(ButtonStyle.Secondary)
      )
    );

    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cat_back_edit").setLabel("Back to Category").setStyle(ButtonStyle.Secondary)
    ));

    return c;
  }
  async _categoryChannel(ctx, st, db){
    const p = await db.getPanel(st.panelId);
    const cat = p.categories.find(c => c.categoryId === st.temp.catId);
    if (!cat) return new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`Category not found`));
    const c = new ContainerBuilder();
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Ticket Category: ${cat.name}\n\nSelect a category to create tickets in`));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Current Category: ${cat.ticketChannelCategory ? `<#${cat.ticketChannelCategory}>` : "Not set"}`));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    c.addActionRowComponents(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId("cat_channel_select").setPlaceholder("Select category").setChannelTypes([ChannelType.GuildCategory]).setMaxValues(1)))
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    c.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("cat_back_edit").setLabel("Back to Category").setStyle(ButtonStyle.Secondary)))
    return c;
  }

  async _logs(ctx, st, db) {
    const p = await db.getPanel(st.panelId);
    if (!p) return new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`Panel not found`));

    const l = p.logs || {};
    const c = new ContainerBuilder();
    const logTypes = [
      { key: "createChannel", label: "Ticket Create" },
      { key: "closeChannel", label: "Ticket Close" },
      { key: "deleteChannel", label: "Ticket Delete" },
      { key: "userAddChannel", label: "User Add" },
      { key: "userRemoveChannel", label: "User Remove" },
      { key: "ratingChannel", label: "Rating" }
    ];

    const itemsPerPage = 3;
    const totalPages = Math.ceil(logTypes.length / itemsPerPage);
    const currentPage = st.page || 0;
    const startIdx = currentPage * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, logTypes.length);
    const pageItems = logTypes.slice(startIdx, endIdx);

    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Log Channel Configuration\n\nPage ${currentPage + 1}/${totalPages}`));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    let logText = "";
    for (const log of pageItems) {
      const channel = l[log.key] ? `<#${l[log.key]}>` : "Not configured";
      logText += `**${log.label}**: ${channel}\n`;
    }
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(logText));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    for (const log of pageItems) {
      const customId = `log_${log.key}_${currentPage}`;
      c.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(customId)
          .setPlaceholder(`Select channel for ${log.label}`)
          .setChannelTypes([ChannelType.GuildText])
          .setMaxValues(1)
      ));
    }

    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    const navRow = new ActionRowBuilder();
    if (currentPage > 0) {
      navRow.addComponents(new ButtonBuilder().setCustomId("log_prev").setLabel("Previous").setStyle(ButtonStyle.Secondary));
    }
    if (currentPage < totalPages - 1) {
      navRow.addComponents(new ButtonBuilder().setCustomId("log_next").setLabel("Next").setStyle(ButtonStyle.Secondary));
    }
    navRow.addComponents(
      new ButtonBuilder().setCustomId("log_reset").setLabel("Clear All Logs").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("panel_back").setLabel("Back to Main").setStyle(ButtonStyle.Secondary)
    );

    c.addActionRowComponents(navRow);

    return c;
  }

  _send(ctx, st) {
    const c = new ContainerBuilder();
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Send Panel\n\nSelect a channel to send the ticket panel message`));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("send_channel")
        .setPlaceholder("Select channel")
        .setChannelTypes([ChannelType.GuildText])
        .setMaxValues(1)
    ));

    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("send_current").setLabel("Send to Current Channel").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("panel_back").setLabel("Back to Main").setStyle(ButtonStyle.Secondary)
    ));

    return c;
  }

  _msg(title, text) {
    return new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}\n\n${text}`));
  }

  async _update(ctx, msg, st, db) {
    try {
      await msg.edit({ components: [await this._render(ctx, st, db)], flags: MessageFlags.IsComponentsV2 });
    } catch (e) {
      logger.error("Panel", "Update failed", e);
    }
  }

  _collector(ctx, msg, db) {
    const col = msg.createMessageComponentCollector({ filter: i => i.user.id === ctx.author.id, time: 600_000 });
    const st = this.state[ctx.guild.id];

    col.on("collect", async i => {
      try {
        const id = i.customId;
        const idBase = id.split("_").slice(0, 2).join("_");

        if (id === "panel_cancel") {
          await i.deferUpdate();
          col.stop();
          await msg.edit({ components: [this._msg("Cancelled", "Operation cancelled")] });
          return;
        }

        if (id === "create_panel") {
          await i.deferUpdate();
          const panel = await db.createPanel(ctx.guild.id, { name: "Ticket Panel" });
          st.panelId = panel.panelId;
          st.view = "MAIN";
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "panel_back") {
          await i.deferUpdate();
          st.view = "MAIN";
          st.temp = {};
          st.page = 0;
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "panel_name") {
          const modal = new ModalBuilder().setCustomId(`pn_${i.id}`).setTitle("Panel Name");
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("input").setLabel("Enter panel name").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)
          ));
          await i.showModal(modal);

          try {
            const sub = await i.awaitModalSubmit({ filter: s => s.customId === `pn_${i.id}`, time: 120_000 });
            await sub.deferUpdate();
            const val = sub.fields.getTextInputValue("input").trim();
            await db.setPanelName(st.panelId, val);
            await this._update(ctx, msg, st, db);
          } catch (e) {}
          return;
        }

        if (id === "panel_message") {
          const p = await db.getPanel(st.panelId);
          const modal = new ModalBuilder().setCustomId(`pm_${i.id}`).setTitle("Panel Message");
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("title")
                .setLabel("Title")
                .setStyle(TextInputStyle.Short)
                .setMaxLength(100)
                .setValue(p.panelMessage?.title || "Ticket Panel")
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("description")
                .setLabel("Description")
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(4000)
                .setValue(p.panelMessage?.description || "Select a category below to create a ticket")
                .setRequired(true)
            )
          );
          await i.showModal(modal);

          try {
            const sub = await i.awaitModalSubmit({ filter: s => s.customId === `pm_${i.id}`, time: 120_000 });
            await sub.deferUpdate();
            const title = sub.fields.getTextInputValue("title").trim();
            const description = sub.fields.getTextInputValue("description").trim();
            await db.setPanelMessage(st.panelId, { title, description });
            await this._update(ctx, msg, st, db);
          } catch (e) {}
          return;
        }

        if (id === "panel_placeholder") {
          const modal = new ModalBuilder().setCustomId(`pp_${i.id}`).setTitle("Menu Placeholder");
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("input").setLabel("Enter placeholder text").setStyle(TextInputStyle.Short).setMaxLength(150).setRequired(true)
          ));
          await i.showModal(modal);

          try {
            const sub = await i.awaitModalSubmit({ filter: s => s.customId === `pp_${i.id}`, time: 120_000 });
            await sub.deferUpdate();
            const val = sub.fields.getTextInputValue("input").trim();
            await db.setPanelSelectMenu(st.panelId, { placeholder: val });
            await this._update(ctx, msg, st, db);
          } catch (e) {}
          return;
        }

        if (id === "panel_status") {
          await i.deferUpdate();
          await db.togglePanelActive(st.panelId);
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "panel_categories") {
          await i.deferUpdate();
          st.view = "CATEGORIES";
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "panel_logs") {
          await i.deferUpdate();
          st.view = "LOGS";
          st.page = 0;
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "panel_send") {
          await i.deferUpdate();
          st.view = "SEND";
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "panel_delete") {
          await i.deferUpdate();
          await db.deletePanel(st.panelId);
          col.stop();
          await msg.edit({ components: [this._msg("Panel Deleted", "The panel has been deleted successfully")] });
          return;
        }

        if (id === "cat_add") {
          const modal = new ModalBuilder().setCustomId(`ca_${i.id}`).setTitle("Add Category");
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("name").setLabel("Category name").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("desc").setLabel("Description (optional)").setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("emoji").setLabel("Emoji (optional)").setStyle(TextInputStyle.Short).setMaxLength(10).setRequired(false))
          );
          await i.showModal(modal);

          try {
            const sub = await i.awaitModalSubmit({ filter: s => s.customId === `ca_${i.id}`, time: 120_000 });
            await sub.deferUpdate();
            const name = sub.fields.getTextInputValue("name").trim();
            const desc = sub.fields.getTextInputValue("desc")?.trim() || null;
            const emojiVal = sub.fields.getTextInputValue("emoji")?.trim() || null;
            await db.addCategory(st.panelId, { name, description: desc, emoji: emojiVal, supportRoles: [] });
            await this._update(ctx, msg, st, db);
          } catch (e) {}
          return;
        }

        if (id === "cat_select") {
          await i.deferUpdate();
          st.temp.catId = i.values[0];
          st.view = "CATEGORY_EDIT";
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "cat_back") {
          await i.deferUpdate();
          st.view = "CATEGORIES";
          st.temp = {};
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "cat_back_edit") {
          await i.deferUpdate();
          st.view = "CATEGORY_EDIT";
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "cat_name") {
          const modal = new ModalBuilder().setCustomId(`cn_${i.id}`).setTitle("Category Name");
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("input").setLabel("Enter category name").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)
          ));
          await i.showModal(modal);

          try {
            const sub = await i.awaitModalSubmit({ filter: s => s.customId === `cn_${i.id}`, time: 120_000 });
            await sub.deferUpdate();
            const val = sub.fields.getTextInputValue("input").trim();
            await db.updateCategory(st.panelId, st.temp.catId, { name: val });
            await this._update(ctx, msg, st, db);
          } catch (e) {}
          return;
        }

        if (id === "cat_desc") {
          const modal = new ModalBuilder().setCustomId(`cd_${i.id}`).setTitle("Category Description");
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("input").setLabel("Enter description (optional)").setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(false)
          ));
          await i.showModal(modal);

          try {
            const sub = await i.awaitModalSubmit({ filter: s => s.customId === `cd_${i.id}`, time: 120_000 });
            await sub.deferUpdate();
            const val = sub.fields.getTextInputValue("input")?.trim() || null;
            await db.updateCategory(st.panelId, st.temp.catId, { description: val });
            await this._update(ctx, msg, st, db);
          } catch (e) {}
          return;
        }

        if (id === "cat_emoji") {
          const modal = new ModalBuilder().setCustomId(`ce_${i.id}`).setTitle("Category Emoji");
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("input").setLabel("Enter emoji (optional)").setStyle(TextInputStyle.Short).setMaxLength(10).setRequired(false)
          ));
          await i.showModal(modal);

          try {
            const sub = await i.awaitModalSubmit({ filter: s => s.customId === `ce_${i.id}`, time: 120_000 });
            await sub.deferUpdate();
            const val = sub.fields.getTextInputValue("input")?.trim() || null;
            await db.updateCategory(st.panelId, st.temp.catId, { emoji: val });
            await this._update(ctx, msg, st, db);
          } catch (e) {}
          return;
        }

        if (id === "cat_roles") {
          await i.deferUpdate();
          st.view = "CATEGORY_ROLES";
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "cat_roles_select") {
          await i.deferUpdate();
          await db.updateCategory(st.panelId, st.temp.catId, { supportRoles: i.values });
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "cat_channel") {
          await i.deferUpdate();
          st.view = "CATEGORY_CHANNEL";
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "cat_naming") {
          const modal = new ModalBuilder().setCustomId(`cnf_${i.id}`).setTitle("Naming Format");
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("input")
              .setLabel("Format (use {username} {number})")
              .setStyle(TextInputStyle.Short)
              .setMaxLength(100)
              .setValue("ticket-{username}-{number}")
              .setRequired(true)
          ));
          await i.showModal(modal);

          try {
            const sub = await i.awaitModalSubmit({ filter: s => s.customId === `cnf_${i.id}`, time: 120_000 });
            await sub.deferUpdate();
            const val = sub.fields.getTextInputValue("input").trim();
            await db.updateCategory(st.panelId, st.temp.catId, { namingFormat: val });
            await this._update(ctx, msg, st, db);
          } catch (e) {}
          return;
        }

        if (id === "cat_settings") {
          await i.deferUpdate();
          st.view = "CATEGORY_SETTINGS";
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "cs_pu" || id === "cs_pr" || id === "cs_uc" || id === "cs_do" || id === "cs_dc") {
          await i.deferUpdate();
          const p = await db.getPanel(st.panelId);
          const cat = p.categories.find(c => c.categoryId === st.temp.catId);
          const s = cat.settings;

          if (id === "cs_pu") await db.updateCategorySettings(st.panelId, st.temp.catId, { pingUser: !s.pingUser });
          else if (id === "cs_pr") await db.updateCategorySettings(st.panelId, st.temp.catId, { pingRole: !s.pingRole });
          else if (id === "cs_uc") await db.updateCategorySettings(st.panelId, st.temp.catId, { userCanClose: !s.userCanClose });
          else if (id === "cs_do") await db.updateCategorySettings(st.panelId, st.temp.catId, { dmUserOnOpen: !s.dmUserOnOpen });
          else if (id === "cs_dc") await db.updateCategorySettings(st.panelId, st.temp.catId, { dmUserOnClose: !s.dmUserOnClose });

          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "cs_max") {
          const modal = new ModalBuilder().setCustomId(`csm_${i.id}`).setTitle("Max Tickets");
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("input")
              .setLabel("Max tickets per user (1-10)")
              .setStyle(TextInputStyle.Short)
              .setValue("1")
              .setRequired(true)
          ));
          await i.showModal(modal);

          try {
            const msub = await i.awaitModalSubmit({ filter: ms => ms.customId === `csm_${i.id}`, time: 120_000 });
            await msub.deferUpdate();
            const num = parseInt(msub.fields.getTextInputValue("input"));
            if (num > 0 && num <= 10) {
              await db.updateCategorySettings(st.panelId, st.temp.catId, { maxTicketsPerUser: num });
            }
            await this._update(ctx, msg, st, db);
          } catch (e) {}
          return;
        }

        if (id === "cat_welcome") {
          const modal = new ModalBuilder().setCustomId(`cw_${i.id}`).setTitle("Welcome Message");
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("input")
              .setLabel("Message (optional)")
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(1000)
              .setRequired(false)
          ));
          await i.showModal(modal);

          try {
            const sub = await i.awaitModalSubmit({ filter: s => s.customId === `cw_${i.id}`, time: 120_000 });
            await sub.deferUpdate();
            const val = sub.fields.getTextInputValue("input")?.trim() || null;
            await db.updateCategorySettings(st.panelId, st.temp.catId, { welcomeMessage: val });
            await this._update(ctx, msg, st, db);
          } catch (e) {}
          return;
        }

        if (id === "cat_status") {
          await i.deferUpdate();
          await db.toggleCategoryActive(st.panelId, st.temp.catId);
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "cat_delete") {
          await i.deferUpdate();
          await db.removeCategory(st.panelId, st.temp.catId);
          st.view = "CATEGORIES";
          st.temp = {};
          await this._update(ctx, msg, st, db);
          return;
        }
        if (id === "cat_channel_select"){
          await i.deferUpdate();
          const channelId = i.values[0];
          await db.updateCategory(st.panelId, st.temp.catId, { ticketChannelCategory: channelId });
           st.view = "CATEGORY_CHANNEL";
          await this._update(ctx, msg, st, db);
        }

        if (id === "log_prev") {
          await i.deferUpdate();
          if (st.page > 0) st.page--;
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "log_next") {
          await i.deferUpdate();
          st.page++;
          await this._update(ctx, msg, st, db);
          return;
        }

        if (idBase === "log_createChannel" || idBase === "log_closeChannel" || 
            idBase === "log_deleteChannel" || idBase === "log_userAddChannel" || 
            idBase === "log_userRemoveChannel" || idBase === "log_ratingChannel") {
          await i.deferUpdate();
          const logKey = id.split("_").slice(1, -1).join("_");
          const ch = i.values?.[0];
          const p = await db.getPanel(st.panelId);
          const logs = p.logs || {};
          logs[logKey] = ch;
          await db.setPanelLogs(st.panelId, logs);
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "log_reset") {
          await i.deferUpdate();
          await db.setPanelLogs(st.panelId, {});
          await this._update(ctx, msg, st, db);
          return;
        }

        if (id === "send_channel" || id === "send_current") {
          await i.deferUpdate();
          const chId = id === "send_current" ? ctx.channel.id : i.values[0];
          const ch = await ctx.guild.channels.fetch(chId);
          if (!ch?.isTextBased()) {
            await msg.edit({ components: [this._msg("Error", "Invalid channel selected")] });
            return;
          }

          const p = await db.getPanel(st.panelId);
          const cats = p.categories.filter(c => c.isActive);

          if (cats.length === 0) {
            await msg.edit({ components: [this._msg("Error", "No active categories. Enable at least one category first.")] });
            return;
          }

          const pmsg = await ch.send({ components: [this._buildPanel(p, cats)], flags: MessageFlags.IsComponentsV2 });
          await db.setPanelMessageId(st.panelId, ch.id, pmsg.id);
          col.stop();
          await msg.edit({ components: [this._msg("Panel Sent", `The ticket panel has been sent to <#${ch.id}>`)] });
          return;
        }

      } catch (e) {
        logger.error("Panel", "Collector error", e);
      }
    });

    col.on("end", () => {
      try {
        ctx.client.utils?.disableComponents(msg).catch(() => {});
      } catch (e) {}
    });
  }

  _buildPanel(panel, cats) {
    const c = new ContainerBuilder();
    const title = panel.panelMessage?.title || "Ticket Panel";
    const description = panel.panelMessage?.description || ` ${emoji.ticket} Select a category below to create a ticket`;

    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    c.addTextDisplayComponents( new TextDisplayBuilder().setContent(description))
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    const opts = cats.map(cat => ({
      label: cat.name.substring(0, 100),
      value: cat.categoryId,
      emoji: cat.emoji || emoji.ticket,
      description: cat.description?.substring(0, 100) || undefined
    }));

    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("ticket_create")
        .setPlaceholder(panel.selectMenuConfig?.placeholder || "Select a ticket category")
        .addOptions(opts)
    ));

    return c;
  }
}

export default new PanelCommand();
// warm bread

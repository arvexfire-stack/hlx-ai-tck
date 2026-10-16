/**
 * Copyright (c) 2025 openUwU
 * Code by bre4d777
 * MIT License
 */

import mongoose from "mongoose";
import { EventEmitter } from "events";
import { Guild, Panel, Ticket, AIAudit } from "./Schema.js";
import { logger } from "#utils/logger";
import { config } from "../config/config.js";

export class DatabaseManager extends EventEmitter {
  constructor(client) {
    super();
    this.client = client;
    this.Guild = Guild;
    this.Panel = Panel;
    this.Ticket = Ticket;
    this.AIAudit = AIAudit;
  }

  async connect(uri) {
    try {
      await mongoose.connect(uri);
      logger.success("Database", "Connected to MongoDB");
      
      // Clean up old indexes that might cause duplicate key errors
      try {
        const indexes = await Guild.collection.getIndexes();
        if (indexes.name_1) {
          await Guild.collection.dropIndex("name_1");
          logger.debug("Database", "Dropped stale name_1 index from guilds collection");
        }
      } catch (indexError) {
        // Ignore index cleanup errors
      }
      
      this.client.emit("databaseConnected");
    } catch (error) {
      logger.error("Database", "Connection failed", error);
      this.client.emit("databaseError", error);
      throw error;
    }
  }

  async disconnect() {
    try {
      await mongoose.disconnect();
      logger.info("Database", "Disconnected from MongoDB");
      this.client.emit("databaseDisconnected");
    } catch (error) {
      logger.error("Database", "Disconnection failed", error);
      this.client.emit("databaseError", error);
    }
  }

  async recordAIAudit(data) {
    return await AIAudit.create(data);
  }

  async getAIAudits(ticketId, limit = 50) {
    return await AIAudit.find({ ticketId }).sort({ createdAt: -1 }).limit(limit).lean();
  }

  async getGuild(guildId) {
    return await Guild.findOne({ guildId });
  }

  async createGuild(guildId, data = {}) {
    const existing = await this.getGuild(guildId);
    if (existing) return existing;
    const guild = await Guild.create({ guildId, ...data });
    logger.debug("Database", `Guild created: ${guildId}`);
    return guild;
  }

  async updateGuild(guildId, data) {
    await this.createGuild(guildId);
    const guild = await Guild.findOneAndUpdate(
      { guildId },
      { $set: data },
      { new: true }
    );
    logger.debug("Database", `Guild updated: ${guildId}`);
    return guild;
  }

  async deleteGuild(guildId) {
    const guild = await Guild.findOneAndDelete({ guildId });
    logger.debug("Database", `Guild deleted: ${guildId}`);
    return guild;
  }

  async setPrefix(guildId, prefix) {
    await this.createGuild(guildId);
    return await Guild.findOneAndUpdate(
      { guildId },
      { $set: { prefix } },
      { new: true }
    );
  }

  async getPrefix(guildId) {
    const guild = await this.getGuild(guildId);
    return guild?.prefix || config.prefix;
  }

  async addBlacklistedUser(guildId, userId, reason, blacklistedBy) {
    await this.createGuild(guildId);
    const guild = await Guild.findOneAndUpdate(
      { guildId },
      {
        $push: {
          blacklistedUsers: {
            userId,
            reason,
            blacklistedBy,
            blacklistedAt: new Date(),
          },
        },
      },
      { new: true }
    );
    this.client.emit("userBlacklisted", { guildId, userId, reason, blacklistedBy });
    return guild;
  }

  async removeBlacklistedUser(guildId, userId) {
    const guild = await Guild.findOneAndUpdate(
      { guildId },
      { $pull: { blacklistedUsers: { userId } } },
      { new: true }
    );
    this.client.emit("userUnblacklisted", { guildId, userId });
    return guild;
  }

  async isUserBlacklisted(guildId, userId) {
    const guild = await this.getGuild(guildId);
    return guild?.blacklistedUsers?.some((u) => u.userId === userId) || false;
  }

  async getBlacklistedUsers(guildId) {
    const guild = await this.getGuild(guildId);
    return guild?.blacklistedUsers || [];
  }

  async setStaffRoles(guildId, roles) {
    return await this.updateGuild(guildId, { staffRoles: roles });
  }

  async addStaffRole(guildId, roleId) {
    await this.createGuild(guildId);
    const guild = await Guild.findOneAndUpdate(
      { guildId },
      { $addToSet: { staffRoles: roleId } },
      { new: true }
    );
    return guild;
  }

  async removeStaffRole(guildId, roleId) {
    const guild = await Guild.findOneAndUpdate(
      { guildId },
      { $pull: { staffRoles: roleId } },
      { new: true }
    );
    return guild;
  }

  async getStaffRoles(guildId) {
    const guild = await this.getGuild(guildId);
    return guild?.staffRoles || [];
  }

  async createPanel(guildId, panelData) {
    const panelId = `panel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const panel = await Panel.create({
      panelId,
      guildId,
      ...panelData,
      categories: [],
    });
    logger.debug("Database", `Panel created: ${panelId}`);
    return panel;
  }

  async getPanel(panelId) {
    return await Panel.findOne({ panelId });
  }


  async getGuildPanels(guildId) {
    return await Panel.find({ guildId });
  }

  async getActivePanels(guildId) {
    return await Panel.find({ guildId, isActive: true });
  }

  async updatePanel(panelId, data) {
    const panel = await Panel.findOneAndUpdate(
      { panelId },
      { $set: data },
      { new: true }
    );
    return panel;
  }

  async setPanelName(panelId, name) {
    return await this.updatePanel(panelId, { name });
  }


  async setPanelLogs(panelId, logs) {
    return await this.updatePanel(panelId, { logs });
  }

  async setPanelSelectMenu(panelId, selectMenuConfig) {
    return await this.updatePanel(panelId, { selectMenuConfig });
  }
  async setPanelMessage(panelId, panelMessage) {
  return await this.updatePanel(panelId, { panelMessage });
}

async setPanelMessageId(panelId, channelId, messageId) {
  return await this.updatePanel(panelId, { channelId, messageId });
}

  async togglePanelActive(panelId) {
    const panel = await this.getPanel(panelId);
    const updated = await this.updatePanel(panelId, { isActive: !panel.isActive });
    return updated;
  }

  async deletePanel(panelId) {
    const panel = await Panel.findOneAndDelete({ panelId });
    logger.debug("Database", `Panel deleted: ${panelId}`);
    return panel;
  }

  async addCategory(panelId, categoryData) {
    const categoryId = `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const panel = await Panel.findOneAndUpdate(
      { panelId },
      {
        $push: {
          categories: {
            categoryId,
            ...categoryData,
          },
        },
      },
      { new: true }
    );
    return panel;
  }

  async updateCategory(panelId, categoryId, data) {
    const panel = await this.getPanel(panelId);
    const category = panel.categories.find(c => c.categoryId === categoryId);
    const updated = await Panel.findOneAndUpdate(
      { panelId, "categories.categoryId": categoryId },
      { $set: { "categories.$": { ...category.toObject(), ...data } } },
      { new: true }
    );
    return updated;
  }

  async removeCategory(panelId, categoryId) {
    const panel = await Panel.findOneAndUpdate(
      { panelId },
      { $pull: { categories: { categoryId } } },
      { new: true }
    );
    return panel;
  }

  async getCategory(panelId, categoryId) {
    const panel = await this.getPanel(panelId);
    return panel?.categories?.find((c) => c.categoryId === categoryId);
  }

  async toggleCategoryActive(panelId, categoryId) {
    const category = await this.getCategory(panelId, categoryId);
    const panel = await this.getPanel(panelId);
    const updatedCategory = panel.categories.find(c => c.categoryId === categoryId);
    updatedCategory.isActive = !category.isActive;
    const updated = await Panel.findOneAndUpdate(
      { panelId, "categories.categoryId": categoryId },
      { $set: { "categories.$": updatedCategory } },
      { new: true }
    );
    return updated;
  }

  async updateCategorySettings(panelId, categoryId, settings) {
    const panel = await this.getPanel(panelId);
    const category = panel.categories.find(c => c.categoryId === categoryId);
    category.settings = { ...category.settings.toObject(), ...settings };
    const updated = await Panel.findOneAndUpdate(
      { panelId, "categories.categoryId": categoryId },
      { $set: { "categories.$": category } },
      { new: true }
    );
    return updated;
  }

  async addCategorySupportRole(panelId, categoryId, roleId) {
    const panel = await Panel.findOneAndUpdate(
      { panelId, "categories.categoryId": categoryId },
      { $addToSet: { "categories.$.supportRoles": roleId } },
      { new: true }
    );
    return panel;
  }

  async removeCategorySupportRole(panelId, categoryId, roleId) {
    const panel = await Panel.findOneAndUpdate(
      { panelId, "categories.categoryId": categoryId },
      { $pull: { "categories.$.supportRoles": roleId } },
      { new: true }
    );
    return panel;
  }

  async createTicket(guildId, panelId, categoryId, userId, data = {}) {
    const ticketId = `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const ticket = await Ticket.create({
      ticketId,
      guildId,
      panelId,
      categoryId,
      userId,
      ...data,
    });
    this.client.emit("ticketCreated", { ticketId, guildId, panelId, categoryId, userId, ticket });
    return ticket;
  }

  async getTicket(ticketId) {
    return await Ticket.findOne({ ticketId });
  }

  async getTicketByChannel(channelId) {
    return await Ticket.findOne({ channelId, status: "open" });
  }
 async getTicketByChannelAny(channelId) {
    return await Ticket.findOne({ channelId }); // Any status
}
  async isTicketChannel(channelId) {
    return !!(await Ticket.findOne({ channelId }));
  }

  async getUserOpenTickets(guildId, userId) {
    return await Ticket.find({ guildId, userId, status: "open" });
  }

  async getUserCategoryOpenTickets(guildId, userId, categoryId) {
    return await Ticket.find({ guildId, userId, categoryId, status: "open" });
  }

  async getGuildOpenTickets(guildId) {
    return await Ticket.find({ guildId, status: "open" });
  }

  async getGuildClosedTickets(guildId) {
    return await Ticket.find({ guildId, status: "closed" });
  }

  async getGuildTickets(guildId) {
    return await Ticket.find({ guildId });
  }

  async getPanelTickets(panelId) {
    return await Ticket.find({ panelId });
  }

  async getCategoryTickets(panelId, categoryId) {
    return await Ticket.find({ panelId, categoryId });
  }

  async getUserTickets(guildId, userId) {
    return await Ticket.find({ guildId, userId });
  }

  async updateTicket(ticketId, data) {
    const ticket = await Ticket.findOneAndUpdate(
      { ticketId },
      { $set: data },
      { new: true }
    );
    return ticket;
  }

  async setTicketChannel(ticketId, channelId) {
    return await this.updateTicket(ticketId, { channelId });
  }
  async setTicketControlMessage(ticketId, controlMessageId) {
    return await this.updateTicket(ticketId, { controlMessageId });
  }

  async claimTicket(ticketId, staffId) {
    const ticket = await Ticket.findOneAndUpdate(
      { ticketId, status: "open", claimedBy: { $in: [null, ""] } },
      {
        $set: {
          claimedBy: staffId,
          claimedAt: new Date(),
          "aiStats.humanTakeover": true,
          "aiStats.escalated": true,
          "aiStats.lastActionAt": new Date(),
        },
      },
      { new: true }
    );
    return ticket;
  }

  async unclaimTicket(ticketId) {
    return await Ticket.findOneAndUpdate(
      { ticketId },
      {
        $set: {
          claimedBy: null,
          claimedAt: null,
          "aiStats.humanTakeover": false,
        },
      },
      { new: true }
    );
  }

  async addTicketUser(ticketId, userId, addedBy) {
    const ticket = await Ticket.findOneAndUpdate(
      { ticketId },
      {
        $push: {
          addedUsers: {
            userId,
            addedBy,
            addedAt: new Date(),
          },
        },
      },
      { new: true }
    );
    this.client.emit("ticketUserAdded", { 
      ticketId, 
      guildId: ticket.guildId, 
      userId, 
      addedBy,
      channelId: ticket.channelId 
    });
    return ticket;
  }

  async removeTicketUser(ticketId, userId, removedBy) {
    const ticket = await Ticket.findOneAndUpdate(
      { ticketId },
      {
        $push: {
          removedUsers: {
            userId,
            removedBy,
            removedAt: new Date(),
          },
        },
        $pull: {
          addedUsers: { userId },
        },
      },
      { new: true }
    );
    this.client.emit("ticketUserRemoved", { 
      ticketId, 
      guildId: ticket.guildId, 
      userId, 
      removedBy,
      channelId: ticket.channelId 
    });
    return ticket;
  }

  async isUserAdded(ticketId, userId) {
    const ticket = await this.getTicket(ticketId);
    return ticket?.addedUsers?.some((u) => u.userId === userId) || false;
  }

  async getAddedUsers(ticketId) {
    const ticket = await this.getTicket(ticketId);
    return ticket?.addedUsers || [];
  }

  async closeTicket(ticketId, closedBy, reason = null) {
    const ticket = await Ticket.findOneAndUpdate(
      { ticketId },
      {
        $set: {
          status: "closed",
          closedBy,
          closedAt: new Date(),
          closeReason: reason,
        },
      },
      { new: true }
    );
    this.client.emit("ticketClosed", { 
      ticketId, 
      guildId: ticket.guildId, 
      userId: ticket.userId,
      closedBy, 
      reason,
      channelId: ticket.channelId 
    });
    return ticket;
  }

  async reopenTicket(ticketId) {
    const ticket = await Ticket.findOneAndUpdate(
      { ticketId },
      {
        $set: {
          status: "open",
          closedBy: null,
          closedAt: null,
          closeReason: null,
        },
      },
      { new: true }
    );
    this.client.emit("ticketReopened", { 
      ticketId, 
      guildId: ticket.guildId, 
      userId: ticket.userId,
      channelId: ticket.channelId 
    });
    return ticket;
  }

  async rateTicket(ticketId, stars, feedback = null) {
    const ticket = await Ticket.findOneAndUpdate(
      { ticketId },
      {
        $set: {
          "rating.stars": stars,
          "rating.feedback": feedback,
          "rating.ratedAt": new Date(),
        },
      },
      { new: true }
    );
    this.client.emit("ticketRated", { 
      ticketId, 
      guildId: ticket.guildId, 
      userId: ticket.userId,
      stars, 
      feedback,
      channelId: ticket.channelId 
    });
    return ticket;
  }

  async deleteTicket(ticketId) {
    const ticket = await Ticket.findOneAndDelete({ ticketId });
    this.client.emit("ticketDeleted", { 
      ticketId, 
      guildId: ticket?.guildId, 
      userId: ticket?.userId,
      channelId: ticket?.channelId 
    });
    return ticket;
  }

  async deleteGuildTickets(guildId) {
    const result = await Ticket.deleteMany({ guildId });
    this.client.emit("guildTicketsDeleted", { guildId, count: result.deletedCount });
    return result;
  }

  async deletePanelTickets(panelId) {
    const result = await Ticket.deleteMany({ panelId });
    this.client.emit("panelTicketsDeleted", { panelId, count: result.deletedCount });
    return result;
  }

  async getUserTicketCount(guildId, userId) {
    return await Ticket.countDocuments({ guildId, userId });
  }

  async getUserOpenTicketCount(guildId, userId) {
    return await Ticket.countDocuments({ guildId, userId, status: "open" });
  }

  async bulkDeleteOldClosedTickets(guildId, daysOld) {
    const threshold = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const result = await Ticket.deleteMany({
      guildId,
      status: "closed",
      closedAt: { $lt: threshold },
    });
    this.client.emit("bulkTicketsDeleted", { guildId, count: result.deletedCount });
    return result;
  }

  async getAllGuilds() {
    return await Guild.find({});
  }
  async getControlMessage(ticketId){
    const ticket = await this.getTicket(ticketId);
    return ticket?.controlMessageId;
  }

  async getGuildCount() {
    return await Guild.countDocuments();
  }

  async getTotalTicketCount() {
    return await Ticket.countDocuments();
  }

  async getAIStats(guildId) {
    const [audits, escalated, aiMessages] = await Promise.all([
      AIAudit.countDocuments({ guildId }),
      Ticket.countDocuments({ guildId, "aiStats.escalated": true }),
      Ticket.aggregate([{ $match: { guildId } }, { $group: { _id: null, messages: { $sum: "$aiStats.messages" }, toolCalls: { $sum: "$aiStats.toolCalls" } } }]),
    ]);
    return { audits, escalated, messages: aiMessages[0]?.messages || 0, toolCalls: aiMessages[0]?.toolCalls || 0 };
  }

  async getTotalOpenTicketCount() {
    return await Ticket.countDocuments({ status: "open" });
  }
}

export const createDatabaseManager = (client) => new DatabaseManager(client);
// bread variable

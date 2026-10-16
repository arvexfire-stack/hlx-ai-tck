import mongoose from "mongoose";

const guildSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  prefix: { type: String, default: "." },
  blacklistedUsers: [{
    userId: String,
    reason: String,
    blacklistedAt: { type: Date, default: Date.now },
    blacklistedBy: String,
  }],
  staffRoles: [String],
  aiSupport: {
    enabled: { type: Boolean, default: true },
    model: { type: String, default: "gemini-3.8-flash" },
    autoActions: { type: Boolean, default: true },
    knowledgeVersion: { type: String, default: "1" },
  },
}, { timestamps: true });

const categorySchema = new mongoose.Schema({
  categoryId: { type: String, required: true },
  name: { type: String, required: true },
  description: String,
  emoji: String,
  supportRoles: [String],
  ticketChannelCategory: String,
  namingFormat: { type: String, default: "ticket-{username}-{number}" },
  settings: {
    pingUser: { type: Boolean, default: true },
    pingRole: { type: Boolean, default: false },
    userCanClose: { type: Boolean, default: true },
    maxTicketsPerUser: { type: Number, default: 1 },
    dmUserOnOpen: { type: Boolean, default: true },
    dmUserOnClose: { type: Boolean, default: true },
    welcomeMessage: String,
    aiModel: String,
    aiEnabled: { type: Boolean, default: true },
  },
  isActive: { type: Boolean, default: true },
});

const panelSchema = new mongoose.Schema({
  panelId: { type: String, required: true, unique: true, index: true },
  guildId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  channelId: String,
  panelMessage: {
    title: { type: String, default: "Ticket Panel" },
    description: { type: String, default: "Select a category below to create a ticket" },
  },
  messageId: String,
  categories: [categorySchema],
  selectMenuConfig: {
    placeholder: { type: String, default: "Select a ticket category" },
    minValues: { type: Number, default: 1 },
    maxValues: { type: Number, default: 1 },
  },
  logs: {
    createChannel: String,
    closeChannel: String,
    deleteChannel: String,
    userAddChannel: String,
    userRemoveChannel: String,
    ratingChannel: String,
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const ticketSchema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true, index: true },
  guildId: { type: String, required: true, index: true },
  panelId: { type: String, required: true, index: true },
  categoryId: { type: String, required: true, index: true },
  channelId: String,
  userId: { type: String, required: true, index: true },
  status: { type: String, enum: ["open", "closed"], default: "open", index: true },
  addedUsers: [{ userId: String, addedBy: String, addedAt: { type: Date, default: Date.now } }],
  removedUsers: [{ userId: String, removedBy: String, removedAt: { type: Date, default: Date.now } }],
  controlMessageId: String,
  claimedBy: String,
  claimedAt: Date,
  closedBy: String,
  closedAt: Date,
  closeReason: String,
  closeSummary: String,
  aiStats: {
    messages: { type: Number, default: 0 },
    toolCalls: { type: Number, default: 0 },
    lastInteractionAt: Date,
    lastActionAt: Date,
    escalated: { type: Boolean, default: false },
    humanTakeover: { type: Boolean, default: false },
    intent: String,
    priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },
    summary: String,
    lastError: String,
    lastProviderLatencyMs: Number,
  },
  rating: {
    stars: { type: Number, min: 1, max: 5 },
    feedback: String,
    ratedAt: Date,
  },
}, { timestamps: true });

const aiAuditSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  ticketId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  type: { type: String, required: true, index: true },
  intent: String,
  tool: String,
  success: { type: Boolean, default: true },
  summary: String,
  metadata: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

const inviteSnapshotSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  code: { type: String, required: true },
  inviterId: { type: String, index: true },
  uses: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
});

const inviteStatSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  successfulInvites: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

inviteSnapshotSchema.index({ guildId: 1, code: 1 }, { unique: true });
inviteStatSchema.index({ guildId: 1, userId: 1 }, { unique: true });
panelSchema.index({ guildId: 1, isActive: 1 });
ticketSchema.index({ guildId: 1, status: 1 });
ticketSchema.index({ userId: 1, status: 1 });
ticketSchema.index({ panelId: 1, categoryId: 1 });
aiAuditSchema.index({ guildId: 1, createdAt: -1 });
aiAuditSchema.index({ ticketId: 1, createdAt: -1 });

export const Guild = mongoose.model("Guild", guildSchema);
export const Panel = mongoose.model("Panel", panelSchema);
export const Ticket = mongoose.model("Ticket", ticketSchema);
export const AIAudit = mongoose.model("AIAudit", aiAuditSchema);
export const InviteSnapshot = mongoose.model("InviteSnapshot", inviteSnapshotSchema);
export const InviteStat = mongoose.model("InviteStat", inviteStatSchema);

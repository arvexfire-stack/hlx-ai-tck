import dotenv from "dotenv";
dotenv.config();

const parseBool = (value, fallback = true) => value == null ? fallback : value !== "false";

export const config = {
  token: process.env.DISCORD_TOKEN || process.env.token,
  clientId: process.env.DISCORD_CLIENT_ID || process.env.clientID,
  prefix: process.env.PREFIX || ".",
  environment: process.env.NODE_ENV || "production",
  database: { url: process.env.MONGODB_URI || process.env.mongodbURL },
  ai: {
    enabled: parseBool(process.env.AI_ENABLED, true),
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    cooldownMs: Number(process.env.AI_COOLDOWN_MS || 1800),
    historyLimit: Number(process.env.AI_HISTORY_LIMIT || 16),
    staffSilenceMs: Number(process.env.AI_STAFF_SILENCE_MS || 5 * 60 * 1000),
    maxToolRounds: Number(process.env.AI_MAX_TOOL_ROUNDS || 8),
    providerTimeoutMs: Number(process.env.AI_PROVIDER_TIMEOUT_MS || 30000),
    thinkingLevel: ["low", "medium", "high"].includes(process.env.AI_THINKING_LEVEL) ? process.env.AI_THINKING_LEVEL : "high",
    autoActions: parseBool(process.env.AI_AUTO_ACTIONS, true),
  },
  vps: {
    apiUrl: (process.env.VPS_BOT_API_URL || "").replace(/\/$/, ""),
    apiToken: process.env.VPS_BOT_API_TOKEN || "",
    timeoutMs: Number(process.env.VPS_BOT_TIMEOUT_MS || 15000),
  },
  business: {
    apiUrl: (process.env.HELZERX_API_URL || "").replace(/\/$/, ""),
    apiToken: process.env.HELZERX_API_TOKEN || "",
    timeoutMs: Number(process.env.HELZERX_API_TIMEOUT_MS || 15000),
  },
  invitePlans: [{
    id: "3-invite-vps",
    name: "3 Invite VPS",
    requiredInvites: 3,
    durationDays: 7,
    cpuCores: 4,
    ramMb: 12 * 1024,
    diskGb: 20,
    defaultOs: "ubuntu-24.04",
  }],
  support: {
    feedbackChannelId: process.env.AI_FEEDBACK_CHANNEL_ID || "1552629200714866718",
  },
  debug: process.env.DEBUG === "true",
  links: {
    supportServer: process.env.SUPPORT_SERVER_URL || "",
    github: "https://github.com/advenslk/Helzerx-ai-ticket",
    invite: process.env.BOT_INVITE_URL || "",
  },
  branding: {
    name: "HelzerX Studio",
    product: "HelzerX Studio AI Support",
    watermark: "HelzerX Studio",
  },
  version: "5.0.0",
};

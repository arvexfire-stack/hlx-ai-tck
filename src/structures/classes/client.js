/**
 * Copyright (c) 2025 openUwU
 * Code by bre4d777
 * MIT License
 */


import {
  Client,
  GatewayIntentBits,
  Collection,
  Partials,
  Options,
} from "discord.js";

import { config } from "#config/config";
import { DatabaseManager } from "#db/Manager";
import { CommandHandler } from "#handlers/CommandHandler";
import { EventLoader } from "#handlers/EventLoader";
import { logger } from "#utils/logger";
import { createUtils } from "#utils/utils";
import { InviteTracker } from "#services/inviteTracker";



export class Bot extends Client {
  constructor() {
    const clientOptions = {
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
      ],
      partials: [
        Partials.Channel,
        Partials.GuildMember,
        Partials.Message,
        Partials.User,
      ],
      makeCache: Options.cacheWithLimits({
        MessageManager: 100,
        PresenceManager: 0,
        UserManager: 100,
      }),
      failIfNotExists: false,
      allowedMentions: { parse: ["users", "roles"], repliedUser: false },
    };


    super(clientOptions);

    this.commands = new Collection();
    this.logger = logger;
    this.config = config;
    this.db = new DatabaseManager(this);
    this.inviteTracker = new InviteTracker(this);
    this.utils = createUtils(this);
    this.commandHandler = new CommandHandler(this);
    this.eventHandler = new EventLoader(this);
  }

  async init() {
    this.logger.info("Bot", `❄️ Initializing bot...`);
    try {
      await this.db.connect(config.database.url)

      await this.eventHandler.loadAllEvents();
      await this.commandHandler.loadCommands();

      if (config.token && typeof config.token === "string" && config.token.trim().length > 10) {
        try {
          await this.login(config.token.trim());
          this.logger.success("Bot", `❄️ Bot has successfully initialized and logged in. 🌸`);
          this.logger.info("Bot", "❄️ HelzerX Studio AI Support active");
        } catch (loginErr) {
          this.logger.warn("Bot", `⚠️ Discord login failed (${loginErr.message}). Web services and AI dashboard remain active.`);
        }
      } else {
        this.logger.warn("Bot", "⚠️ DISCORD_TOKEN is not configured in .env. Bot running in Web Dashboard & AI Support Service mode.");
      }
    } catch (error) {
      this.logger.error("Bot", "❄️ Failed to initialize bot cluster:", error);
      throw error;
    }
  }

  async cleanup() {
    this.logger.warn("Bot", `❄️ Starting cleanup for bot...`);
    try {

      this.destroy();

      this.logger.success("Bot", "❄️ Cleanup completed successfully. 🌸");
    } catch (error) {
      this.logger.error("Bot", "❄️ An error occurred during cleanup:", error);
    }
  }
}

// bread factor

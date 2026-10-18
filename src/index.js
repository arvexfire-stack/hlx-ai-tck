/**
 * Copyright (c) 2025 openUwU
 * Code by bre4d777
 * MIT License
 */

import { Bot } from "#classes/client";
import { logger } from "#utils/logger";
import { createWebServer } from "./web/server.js";

process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (
    warning.name === "DeprecationWarning" &&
    warning.message.includes("ready event has been renamed to clientReady")
  ) {
    return;
  }
  console.warn(warning);
});

const client = new Bot();
let webServer = null;

const main = async () => {
  try {
    // Start Express Web Server on port 3000
    webServer = createWebServer(client);

    // Initialize Discord Bot client
    await client.init();
    logger.success("Main", "HelzerX Technologies AI Support Bot & Web Console operational");
  } catch (error) {
    logger.error("Main", "Bot initialization notice:", error.message || error);
  }
};

const shutdown = async (signal) => {
  logger.info("Shutdown", `Received ${signal}, shutting down gracefully...`);
  try {
    await client.cleanup();
    logger.success("Shutdown", "Bot shut down successfully");
    process.exit(0);
  } catch (error) {
    logger.error("Shutdown", "Error during shutdown", error);
    process.exit(1);
  }
};

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Process", "Unhandled Rejection", reason);
  logger.error(promise);
});

process.on("uncaughtException", (error, origin) => {
  logger.error("Process", `Uncaught Exception: ${origin}`, error);
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main();

export { client };

// kneaded logic

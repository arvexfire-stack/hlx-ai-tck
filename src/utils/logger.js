/**
 * Copyright (c) 2025 openUwU
 * Code by bre4d777
 * MIT License
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import util from "util";

const config = {
  logLevel: "debug",
  logRotationSizeMB: 5,
  defaultContext: "APP",
  timezone: "Asia/Colombo",
  colors: {
    info: "#2A4A6A",
    success: "#2A4A3A",
    warning: "#4A3A1A",
    error: "#4A2525",
    debug: "#2A2A2A",
  },
  textColors: {
    message: "#9E9E9E",
    timestamp: "#5A5A5A",
    dimmed: "#4A4A4A",
    badge: "#B8B8B8",
  },
};

const createRgbColor = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (text) => `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
};

const createBgColor = (bgHex, fgHex) => {
  const bgR = parseInt(bgHex.slice(1, 3), 16);
  const bgG = parseInt(bgHex.slice(3, 5), 16);
  const bgB = parseInt(bgHex.slice(5, 7), 16);
  const fgR = parseInt(fgHex.slice(1, 3), 16);
  const fgG = parseInt(fgHex.slice(3, 5), 16);
  const fgB = parseInt(fgHex.slice(5, 7), 16);
  return (text) => `\x1b[48;2;${bgR};${bgG};${bgB}m\x1b[38;2;${fgR};${fgG};${fgB}m ${text} \x1b[0m`;
};

const textStyle = {
  message: createRgbColor(config.textColors.message),
  timestamp: createRgbColor(config.textColors.timestamp),
  dimmed: createRgbColor(config.textColors.dimmed),
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, "../../logs");

class Logger {
  constructor() {
    this.levels = { debug: 0, info: 1, success: 2, warn: 3, error: 4 };
    this.consoleLogLevel = this.levels[config.logLevel] ?? 1;
    this.contextBadges = {
      info: createBgColor(config.colors.info, config.textColors.badge),
      success: createBgColor(config.colors.success, config.textColors.badge),
      warn: createBgColor(config.colors.warning, config.textColors.badge),
      error: createBgColor(config.colors.error, config.textColors.badge),
      debug: createBgColor(config.colors.debug, config.textColors.badge),
    };

    // Always initialize usable paths before touching the filesystem. If the log
    // directory is unavailable, logging safely falls back to the service journal.
    this.logFilePath = path.join(LOG_DIR, "app.log");
    this.errorLogFilePath = path.join(LOG_DIR, "error.log");
    this.fileLoggingAvailable = false;
    this._initLogFiles();
  }

  _getTimestamp() {
    return new Date().toLocaleString("en-IN", {
      timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  }

  _getTimeOnly() {
    return new Date().toLocaleTimeString("en-IN", {
      timeZone: config.timezone, hour: "2-digit", minute: "2-digit",
      second: "2-digit", hour12: false,
    });
  }

  _initLogFiles() {
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      this._rotateLogFile(this.logFilePath);
      this._rotateLogFile(this.errorLogFilePath);
      this.fileLoggingAvailable = true;
      const separator = "=".repeat(80);
      this._writeToFile(this.logFilePath, `\n${separator}\nLog session started at ${this._getTimestamp()}\n${separator}`);
    } catch (error) {
      this.fileLoggingAvailable = false;
      console.error("[Logger] File logging unavailable; using systemd journal:", error?.message || error);
    }
  }

  _rotateLogFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return;
      if (fs.statSync(filePath).size / (1024 * 1024) > config.logRotationSizeMB) {
        const timestamp = this._getTimestamp().replace(/[/:,\s]/g, "-");
        fs.renameSync(filePath, `${filePath}.${timestamp}`);
      }
    } catch (error) {
      console.error("[Logger] Failed to rotate log file:", error?.message || error);
    }
  }

  _writeToFile(filePath, content) {
    if (!this.fileLoggingAvailable || !filePath) return;
    try {
      fs.appendFileSync(filePath, `${content}\n`);
    } catch (error) {
      this.fileLoggingAvailable = false;
      console.error("[Logger] File logging disabled; using systemd journal:", error?.message || error);
    }
  }

  _formatForFile(level, context, message) {
    return `[${this._getTimestamp()}] [${level.toUpperCase()}] [${context}] ${message}`;
  }

  _parseArgs(args) {
    let context = config.defaultContext;
    let errorObject = null;
    const argsCopy = [...args];
    if (argsCopy.length > 0 && argsCopy[argsCopy.length - 1] instanceof Error) errorObject = argsCopy.pop();
    if (argsCopy.length > 1 && typeof argsCopy[0] === "string") {
      const candidate = argsCopy[0];
      if (candidate.length <= 20 && /^[A-Z0-9_\-:]+$/i.test(candidate)) context = argsCopy.shift();
    }
    return { context, message: argsCopy.length ? util.format(...argsCopy) : "", errorObject };
  }

  _log(level, ...args) {
    if ((this.levels[level] ?? 1) < this.consoleLogLevel) return;
    const { context, message, errorObject } = this._parseArgs(args);
    const formatted = `${textStyle.timestamp(this._getTimeOnly())} ${this.contextBadges[level](context)} ${textStyle.message(message)}`;
    (level === "error" || level === "warn" ? console.warn : console.log)(formatted);
    const fileMessage = this._formatForFile(level, context, message);
    this._writeToFile(this.logFilePath, fileMessage);

    const finalError = level === "error" && !errorObject ? new Error(message) : errorObject;
    if (finalError) {
      const stack = finalError.stack || util.inspect(finalError, { depth: 4 });
      console.log(textStyle.dimmed(stack));
      this._writeToFile(this.errorLogFilePath, `${fileMessage}\n${stack}`);
    }
  }

  info(...args) { this._log("info", ...args); }
  success(...args) { this._log("success", ...args); }
  warn(...args) { this._log("warn", ...args); }
  error(...args) { this._log("error", ...args); }
  debug(...args) { this._log("debug", ...args); }
}

export const logger = new Logger();

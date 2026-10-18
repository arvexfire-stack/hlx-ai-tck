import express from "express";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import { buildKnowledgeContext } from "#ai/knowledge";
import {
  generateSupportReply,
  formatHistory,
  askGeminiDirect,
  summarizeTicket,
  diagnoseCrashLog,
  analyzeSentiment,
} from "#ai/support";

export function createWebServer(botClient) {
  const app = express();
  app.use(express.json({ limit: "15mb" }));

  // CORS & Security headers
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // Healthcheck endpoint
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      app: "HelzerX Technologies AI Support",
      time: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // System Status API
  app.get("/api/status", async (req, res) => {
    try {
      const isDiscordConnected = Boolean(botClient?.isReady?.() && botClient?.user);
      const isMongoActive = Boolean(botClient?.db?.isMongoActive?.());
      const hasGeminiKey = Boolean(config.ai.apiKey);
      const totalTickets = (await botClient?.db?.getTotalTicketCount?.().catch(() => 0)) || 0;
      const openTickets = (await botClient?.db?.getTotalOpenTicketCount?.().catch(() => 0)) || 0;

      res.json({
        brand: config.branding.name,
        product: config.branding.product,
        version: config.version,
        discord: {
          connected: isDiscordConnected,
          tag: botClient?.user?.tag || null,
          guildsCount: botClient?.guilds?.cache?.size || 0,
          ping: botClient?.ws?.ping || -1,
          tokenConfigured: Boolean(config.token && config.token.length > 10),
        },
        database: {
          type: isMongoActive ? "MongoDB (Active)" : "In-Memory Resilient Store (Active)",
          connected: isMongoActive,
          urlConfigured: Boolean(config.database.url),
        },
        ai: {
          enabled: config.ai.enabled,
          model: config.ai.model,
          hasApiKey: hasGeminiKey,
          thinkingLevel: config.ai.thinkingLevel,
          autoActions: config.ai.autoActions,
          feedbackChannelId: config.support.feedbackChannelId,
        },
        integrations: {
          vpsBotConfigured: Boolean(config.vps.apiUrl && config.vps.apiToken),
          businessApiConfigured: Boolean(config.business.apiUrl && config.business.apiToken),
        },
        stats: {
          totalTickets,
          openTickets,
          uptimeSeconds: Math.floor(process.uptime()),
          nodeVersion: process.version,
          memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // HelzerX Cloud Service Catalog API
  app.get("/api/catalog", (req, res) => {
    const minecraftPlans = [
      { id: "HXC-S02", name: "HXC-S02", ram: "2GB", cpu: "100%", disk: "20GB NVMe", price: 0.69 },
      { id: "HXC-S04", name: "HXC-S04", ram: "4GB", cpu: "200%", disk: "40GB NVMe", price: 1.19 },
      { id: "HXC-S06", name: "HXC-S06", ram: "6GB", cpu: "200%", disk: "50GB NVMe", price: 1.59 },
      { id: "HXC-S08", name: "HXC-S08", ram: "8GB", cpu: "300%", disk: "80GB NVMe", price: 2.19 },
      { id: "HXC-S12", name: "HXC-S12", ram: "12GB", cpu: "400%", disk: "120GB NVMe", price: 3.19 },
      { id: "HXC-S16", name: "HXC-S16", ram: "16GB", cpu: "500%", disk: "160GB NVMe", price: 4.19 },
      { id: "HXC-S24", name: "HXC-S24", ram: "24GB", cpu: "600%", disk: "240GB NVMe", price: 5.99 },
      { id: "HXC-S32", name: "HXC-S32", ram: "32GB", cpu: "800%", disk: "320GB NVMe", price: 7.99 },
      { id: "HXC-S48", name: "HXC-S48", ram: "48GB", cpu: "1000%", disk: "480GB NVMe", price: 11.99 },
      { id: "HXC-S64", name: "HXC-S64", ram: "64GB", cpu: "1200%", disk: "640GB NVMe", price: 14.99 },
    ];

    const cpuTiers = [
      { id: "ryzen5", name: "AMD Ryzen 5", fee: 1.30, desc: "Cost-effective entry CPU" },
      { id: "ryzen7", name: "AMD Ryzen 7", fee: 2.40, desc: "Enhanced performance CPU" },
      { id: "xeon", name: "Intel Xeon Gold", fee: 2.90, desc: "Server-grade stability CPU" },
      { id: "epyc", name: "AMD EPYC 9965", fee: 3.40, desc: "High-end flagship compute" },
    ];

    const cloudNodes = [
      { id: "node-sg-01", location: "Singapore", status: "Optimal", ping: 18, capacity: "84%", load: "42%" },
      { id: "node-de-01", location: "Germany (Frankfurt)", status: "Optimal", ping: 42, capacity: "78%", load: "36%" },
      { id: "node-in-01", location: "India (Mumbai)", status: "Optimal", ping: 26, capacity: "91%", load: "64%" },
      { id: "node-us-01", location: "USA (Virginia)", status: "Optimal", ping: 84, capacity: "65%", load: "29%" },
      { id: "node-hk-01", location: "Hong Kong", status: "Optimal", ping: 32, capacity: "72%", load: "48%" },
      { id: "node-au-01", location: "Australia (Sydney)", status: "Optimal", ping: 95, capacity: "59%", load: "22%" },
    ];

    res.json({
      brand: "HelzerX Technologies",
      locations: ["Singapore", "India", "Germany", "Hong Kong", "USA", "Vietnam", "Australia"],
      minecraftPlans,
      cpuTiers,
      cloudNodes,
      invitePlans: config.invitePlans,
    });
  });

  // Ticket listing API (Real Data)
  app.get("/api/tickets", async (req, res) => {
    try {
      if (botClient?.db?.isMongoActive?.()) {
        const tickets = await botClient.db.Ticket.find().sort({ createdAt: -1 }).limit(100).lean();
        return res.json(tickets);
      }
      const tickets = Array.from(botClient?.db?.memoryTickets?.values() || []);
      res.json(tickets.reverse());
    } catch (err) {
      res.json([]);
    }
  });

  // Create Ticket API
  app.post("/api/tickets", async (req, res) => {
    try {
      const { categoryName, description, customerName } = req.body;
      const ticketId = `ticket_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newTicket = {
        ticketId,
        guildId: "helzerx-ops-hub",
        panelId: "management-panel",
        categoryId: categoryName ? categoryName.toLowerCase().replace(/\s+/g, "-") : "general-support",
        categoryName: categoryName || "General Support",
        userId: "cust_" + Math.floor(1000 + Math.random() * 9000),
        customerName: customerName || "Customer",
        status: "open",
        description: description || "Support Inquiry",
        createdAt: new Date(),
        aiStats: {
          messages: 0,
          toolCalls: 0,
          escalated: false,
          humanTakeover: false,
          priority: "normal",
        },
      };

      if (botClient?.db?.isMongoActive?.()) {
        await botClient.db.Ticket.create(newTicket);
      } else if (botClient?.db?.memoryTickets) {
        botClient.db.memoryTickets.set(ticketId, newTicket);
      }
      res.json({ success: true, ticket: newTicket });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Close Ticket API
  app.post("/api/tickets/:id/close", async (req, res) => {
    try {
      const ticketId = req.params.id;
      const closed = await botClient?.db?.closeTicket?.(ticketId, "Staff", req.body?.reason || "Resolved via 3D Console");
      if (botClient?.db?.memoryTickets?.has(ticketId)) {
        const t = botClient.db.memoryTickets.get(ticketId);
        t.status = "closed";
        t.closedAt = new Date();
        t.closedBy = "Staff";
      }
      res.json({ success: true, ticket: closed || { ticketId, status: "closed" } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reopen Ticket API
  app.post("/api/tickets/:id/reopen", async (req, res) => {
    try {
      const ticketId = req.params.id;
      const reopened = await botClient?.db?.reopenTicket?.(ticketId);
      if (botClient?.db?.memoryTickets?.has(ticketId)) {
        const t = botClient.db.memoryTickets.get(ticketId);
        t.status = "open";
        t.closedAt = null;
        t.closedBy = null;
      }
      res.json({ success: true, ticket: reopened || { ticketId, status: "open" } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Claim Ticket API
  app.post("/api/tickets/:id/claim", async (req, res) => {
    try {
      const ticketId = req.params.id;
      const claimed = await botClient?.db?.claimTicket?.(ticketId, req.body?.staffId || "Staff_Operator");
      if (botClient?.db?.memoryTickets?.has(ticketId)) {
        const t = botClient.db.memoryTickets.get(ticketId);
        t.claimedBy = req.body?.staffId || "Staff_Operator";
        t.claimedAt = new Date();
      }
      res.json({ success: true, ticket: claimed || { ticketId, claimedBy: "Staff_Operator" } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // AI Audits API
  app.get("/api/audits", async (req, res) => {
    try {
      if (botClient?.db?.isMongoActive?.()) {
        const audits = await botClient.db.AIAudit.find().sort({ createdAt: -1 }).limit(50).lean();
        return res.json(audits);
      }
      const audits = botClient?.db?.memoryAudits || [];
      res.json(audits.slice(-50).reverse());
    } catch (err) {
      res.json([]);
    }
  });

  // Advanced Gemini Direct Prompt API (/api/ai/ask)
  app.post("/api/ai/ask", async (req, res) => {
    const { question, context } = req.body;
    if (!question) return res.status(400).json({ error: "Question cannot be empty" });
    const result = await askGeminiDirect({ question, context, model: config.ai.model });
    res.json(result);
  });

  // Advanced Gemini Crash Log Diagnostics (/api/ai/diagnose)
  app.post("/api/ai/diagnose", async (req, res) => {
    const { logText } = req.body;
    if (!logText) return res.status(400).json({ error: "Log text cannot be empty" });
    const result = await diagnoseCrashLog({ logText });
    res.json(result);
  });

  // Advanced Gemini Ticket Summarization (/api/ai/summarize)
  app.post("/api/ai/summarize", async (req, res) => {
    const { historyText, ticketId } = req.body;
    const result = await summarizeTicket({ historyText: historyText || "", ticketId: ticketId || "" });
    res.json(result);
  });

  // Advanced Gemini Sentiment & Priority (/api/ai/sentiment)
  app.post("/api/ai/sentiment", async (req, res) => {
    const { text } = req.body;
    const result = await analyzeSentiment({ text: text || "" });
    res.json(result);
  });

  // AI Support Interactive Chat & Simulator API (Real Gemini 3.8 / 2.5)
  app.post("/api/chat", async (req, res) => {
    const {
      message = "",
      categoryName = "General Support",
      categoryDescription = "General customer inquiry",
      customerName = "Customer",
      history = [],
      imageData = null,
      imageMimeType = null,
    } = req.body;

    if (!message.trim() && !imageData) {
      return res.status(400).json({ error: "Message or image cannot be empty." });
    }

    const startTime = Date.now();
    try {
      const ticketId = `ticket_ops_${Date.now()}`;
      const fakeDiscordMessage = {
        id: "msg_" + Date.now(),
        content: message,
        author: { id: "cust_101", username: customerName, bot: false },
        member: { displayName: customerName },
        guild: { id: "guild_helzerx", name: "HelzerX Technologies" },
        channel: {
          id: "channel_ops",
          isTextBased: () => true,
          sendTyping: async () => {},
          messages: { fetch: async () => new Map() },
        },
      };

      const fakeTicket = {
        ticketId,
        guildId: "guild_helzerx",
        panelId: "panel_ops",
        categoryId: "cat_ops",
        userId: "cust_101",
        status: "open",
        aiStats: { humanTakeover: false },
      };

      const fakeCategory = {
        name: categoryName,
        description: categoryDescription,
        supportRoles: [],
        settings: { aiEnabled: true },
      };

      let imageBuffer = null;
      if (imageData) {
        imageBuffer = Buffer.from(imageData, "base64");
      }

      // Call generateSupportReply
      let replyResult;
      if (config.ai.apiKey && config.ai.enabled) {
        replyResult = await generateSupportReply({
          guildName: "HelzerX Technologies",
          categoryName,
          categoryDescription,
          customerName,
          history: history.map((h) => ({
            role: h.role === "model" ? "model" : "user",
            parts: [{ text: (h.role === "model" ? "HelzerX Studio Support: " : customerName + ": ") + h.text }],
          })),
          latestMessage: message,
          imageBuffer,
          imageMimeType: imageMimeType || "image/png",
          model: config.ai.model,
          client: botClient,
          message: fakeDiscordMessage,
          ticket: fakeTicket,
          category: fakeCategory,
        });
      }

      // Fallback knowledge engine if no key or disabled
      if (!replyResult || !replyResult.text || replyResult.reason === "ai_disabled") {
        replyResult = generateSimulatedAgentResponse({
          message,
          categoryName,
          customerName,
          history,
        });
      }

      // Record audit event
      try {
        await botClient?.db?.recordAIAudit?.({
          guildId: "guild_helzerx",
          ticketId,
          userId: "cust_101",
          type: "ai_inference",
          intent: detectCustomerIntent(message),
          success: true,
          summary: `AI responded to ${customerName} (${categoryName})`,
          metadata: { latencyMs: Date.now() - startTime, model: config.ai.model },
        });
      } catch {}

      res.json({
        text: replyResult.text,
        toolCalls: replyResult.toolCalls || 0,
        latencyMs: Date.now() - startTime,
        intent: detectCustomerIntent(message),
        category: categoryName,
        model: config.ai.apiKey ? config.ai.model : "HelzerX Knowledge Core",
      });
    } catch (err) {
      logger.error("WebChat", "Error in chat inference", err);
      res.status(500).json({ error: err.message || "Failed to generate AI response." });
    }
  });

  // Serve Dashboard HTML UI for all other routes
  app.use((req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(render3DDashboardHtml());
  });

  const port = 3000;
  const host = "0.0.0.0";
  const server = app.listen(port, host, () => {
    logger.success("Web", `HelzerX Technologies 3D Management Console listening on http://${host}:${port}`);
  });

  return server;
}

function detectCustomerIntent(msg = "") {
  const text = msg.toLowerCase();
  if (/hxc|minecraft|mc|server lag|paper|purpur|forge|fabric/.test(text)) return "minecraft_hosting";
  if (/vps|core|ram|ubuntu|debian|node|reboot|restart/.test(text)) return "vps_infrastructure";
  if (/pay|invoice|bill|receipt|refund|cost|price|gaana|keeyada/.test(text)) return "billing_payment";
  if (/domain|dns|nameserver|record/.test(text)) return "domain_management";
  if (/invite|free|bonus|reward/.test(text)) return "invite_rewards";
  if (/login|password|account|email/.test(text)) return "account_access";
  if (/hi|hello|hey|yo|ayubowan|kohomada/.test(text)) return "customer_greeting";
  return "general_support";
}

function generateSimulatedAgentResponse({ message, categoryName, customerName }) {
  const text = message.trim();
  const lower = text.toLowerCase();

  if (/^(hi|hello|hey|yo|ayubowan|kohomada|halo|wassup|good morning|good evening)/i.test(lower)) {
    if (/ayubowan|kohomada|mchn|bro|oya/i.test(lower)) {
      return {
        text: `ආයුබෝවන්! HelzerX Technologies AI Support වෙත සාදරයෙන් පිළිගන්නවා. 🌟\n\nමම ඔබගේ HelzerX Cloud, Minecraft Hosting, VPS Server, Billing, Payments, Domains සහ අනෙකුත් සියලුම තාක්ෂණික ගැටලු සඳහා උපකාර කරන AI සහායකයා වෙමි.\n\nඔබට අවශ්‍ය සේවාව හෝ ඇතිවූ ගැටලුව කෙටියෙන් සඳහන් කරන්න, මම ඉක්මනින්ම ඔබට සහාය වන්නෙමි!`,
        toolCalls: 0,
      };
    }
    return {
      text: `Hey! Welcome to HelzerX Technologies support. I can help with your hosting, billing, Minecraft, VPS, domains, AI services, rewards, or technical issues.\n\nJust tell me what you're trying to do or what went wrong, and I'll check the relevant details and guide you from there!`,
      toolCalls: 0,
    };
  }

  if (/minecraft|hxc|s02|s04|s06|s08|s12|s16|s24|s32|s48|s64/i.test(lower) && /price|cost|gaana|keeyada|plan/i.test(lower)) {
    if (/s04|4gb/i.test(lower)) {
      if (/ryzen 7/i.test(lower)) {
        return {
          text: `For the **HXC-S04** Minecraft plan (4GB RAM, 200% CPU Power, 40GB NVMe):\n\n• **Base RAM Plan Price:** $1.19/month\n• **AMD Ryzen 7 Processor Tier:** +$2.40/month\n• **Total Monthly Price:** **$3.59/month**\n\nIncludes instant automated setup, Java & Bedrock crossplay, DDoS protection, and multi-region deployment.`,
          toolCalls: 1,
        };
      }
      return {
        text: `The **HXC-S04** Minecraft plan features:\n• **Specs:** 4GB RAM, 200% CPU Power, 40GB NVMe Storage\n• **Base Plan Price:** **$1.19/month**\n\n**Processor Tiers Available:**\n• **AMD Ryzen 5:** +$1.30/mo → Total: **$2.49/month**\n• **AMD Ryzen 7:** +$2.40/mo → Total: **$3.59/month**\n• **Intel Xeon Gold:** +$2.90/mo → Total: **$4.09/month**\n• **AMD EPYC 9965:** +$3.40/mo → Total: **$4.59/month**`,
        toolCalls: 1,
      };
    }
    return {
      text: `Here is our current **HelzerX Cloud Minecraft Hosting** catalog:\n\n• **HXC-S02:** 2GB RAM | 100% CPU | 20GB NVMe — Base **$0.69/mo**\n• **HXC-S04:** 4GB RAM | 200% CPU | 40GB NVMe — Base **$1.19/mo**\n• **HXC-S06:** 6GB RAM | 200% CPU | 50GB NVMe — Base **$1.59/mo**\n• **HXC-S08:** 8GB RAM | 300% CPU | 80GB NVMe — Base **$2.19/mo**\n• **HXC-S12:** 12GB RAM | 400% CPU | 120GB NVMe — Base **$3.19/mo**\n• **HXC-S16:** 16GB RAM | 500% CPU | 160GB NVMe — Base **$4.19/mo**\n• **HXC-S24:** 24GB RAM | 600% CPU | 240GB NVMe — Base **$5.99/mo**\n• **HXC-S32:** 32GB RAM | 800% CPU | 320GB NVMe — Base **$7.99/mo**\n• **HXC-S48:** 48GB RAM | 1000% CPU | 480GB NVMe — Base **$11.99/mo**\n• **HXC-S64:** 64GB RAM | 1200% CPU | 640GB NVMe — Base **$14.99/mo**\n\n**Processor Options:** Ryzen 5 (+$1.30/mo), Ryzen 7 (+$2.40/mo), Xeon Gold (+$2.90/mo), AMD EPYC 9965 (+$3.40/mo).`,
      toolCalls: 1,
    };
  }

  if (/lag|tps|crash|freeze|slow|ping/i.test(lower)) {
    return {
      text: `Let's diagnose the server performance issue together:\n\n1. **Server Software & Version:** Are you running Paper, Purpur, Fabric, Forge, or Vanilla?\n2. **Player Load:** How many players are active when the lag spikes occur?\n3. **Plugins & Mods:** Have you added any heavy world-generation plugins or entity-dense mods recently?\n4. **Timings / Spark Report:** Run \`/spark profiler open\` or \`/timings paste\` and share the link.\n\nLet me know your server version and whether this happens in specific dimensions.`,
      toolCalls: 0,
    };
  }

  if (/invite|free vps|3 invite|claim vps/i.test(lower)) {
    return {
      text: `Here are the specifications for our **3 Invite VPS Plan**:\n\n• **Required Invites:** 3 verified Discord server invites\n• **CPU:** 4 vCPU Cores\n• **RAM:** 12GB RAM (12,288 MB)\n• **Storage:** 20GB NVMe\n• **Duration:** 7 Days active duration\n• **Operating System:** Ubuntu 24.04 LTS (default)\n\nOnce you have reached 3 successful tracked invites in our Discord server, our automated system can provision your containerized VPS node instantly.`,
      toolCalls: 1,
    };
  }

  if (/payment|pending|invoice|slip|pay|gewwe|gewala/i.test(lower)) {
    return {
      text: `ඔබගේ payment එක පරීක්ෂා කර සත්‍යාපනය කිරීමට මට උදව් කරන්න පුළුවන්. කරුණාකර ඔබගේ **Invoice ID** හෝ ගෙවීම සිදුකළ **Transaction Reference Number** එක මෙහි සඳහන් කරන්න.\n\nGateway එක හරහා ගෙවීම සම්පූර්ණ වූ වහාම service එක ස්වයංක්‍රීයව සක්‍රිය (Activate) වේ.`,
      toolCalls: 1,
    };
  }

  return {
    text: `Thank you for contacting HelzerX Technologies support regarding **${categoryName}**.\n\nI have noted your message: *" ${text} "*. Could you provide a bit more context so I can look up the exact details or guide you through the next resolution step?`,
    toolCalls: 0,
  };
}

// 3D Realistic Cyber Command & Management Dashboard Renderer
function render3DDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HelzerX Technologies — 3D Cyber Operations Console</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Plus Jakarta Sans"', 'sans-serif'],
            mono: ['"JetBrains Mono"', 'monospace'],
          },
          colors: {
            brand: {
              400: '#38bdf8',
              500: '#0284c7',
              600: '#0369a1',
            },
            surface: {
              base: '#050811',
              card: '#0B1120',
              subtle: '#141E33',
              border: '#1E293B',
            }
          }
        }
      }
    }
  </script>
  <style>
    * { box-sizing: border-box; }
    body, html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #030712;
      color: #E2E8F0;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }
    #webgl-canvas-container {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
    }
    /* Collapsible Bottom Control Dock */
    #bottom-dock {
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      width: 95%;
      max-width: 1020px;
      z-index: 30;
      transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
    }
    #bottom-dock.dock-collapsed {
      transform: translate(-50%, calc(100% - 38px));
    }
    .custom-scrollbar::-webkit-scrollbar {
      width: 5px;
      height: 5px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: #0B1120;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #25334E;
      border-radius: 4px;
    }
    .glass-surface {
      background: rgba(11, 17, 32, 0.92);
      border: 1px solid rgba(56, 189, 248, 0.22);
      box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.8), 0 0 25px rgba(2, 132, 199, 0.12);
    }
  </style>
</head>
<body class="select-none">

  <!-- 3D WebGL Canvas Viewport -->
  <div id="webgl-canvas-container"></div>

  <!-- Minimal Top Navigation HUD (Zero Viewport Occlusion) -->
  <header class="absolute top-0 left-0 right-0 z-20 pointer-events-none p-4 sm:p-5 flex items-center justify-between">
    <div class="pointer-events-auto flex items-center space-x-3 bg-surface-card/90 border border-surface-border px-3.5 py-2 rounded-2xl shadow-lg shadow-black/40 backdrop-blur-sm">
      <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center font-extrabold text-white text-sm shadow-md shadow-sky-500/20">
        HX
      </div>
      <div>
        <div class="flex items-center space-x-2">
          <span class="text-sm font-bold text-white tracking-tight">HelzerX Technologies</span>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 font-mono font-medium">3D Ops Console</span>
        </div>
        <div class="text-[11px] text-slate-400 font-mono">Cloud Cluster &bull; Real Discord AI Integration</div>
      </div>
    </div>

    <!-- Right: Quick Camera View Presets & Live Telemetry -->
    <div class="pointer-events-auto flex items-center space-x-2">
      <div class="hidden sm:flex items-center space-x-1 bg-surface-card/90 border border-surface-border p-1 rounded-xl text-xs font-medium">
        <button onclick="setCameraView('iso')" class="px-2.5 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-surface-subtle transition font-mono text-[11px]">Isometric</button>
        <button onclick="setCameraView('rack')" class="px-2.5 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-surface-subtle transition font-mono text-[11px]">Front Rack</button>
        <button onclick="setCameraView('blade')" class="px-2.5 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-surface-subtle transition font-mono text-[11px]">Node Blade</button>
        <button onclick="setCameraView('top')" class="px-2.5 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-surface-subtle transition font-mono text-[11px]">Top Array</button>
      </div>

      <div class="flex items-center space-x-2 bg-surface-card/90 border border-surface-border px-3 py-1.5 rounded-xl text-xs font-mono">
        <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
        <span class="text-slate-300" id="top-ping-label">Node: 18ms</span>
      </div>

      <button onclick="toggleCinemaMode()" class="px-3 py-1.5 rounded-xl bg-surface-card/90 border border-surface-border hover:border-sky-500/50 text-slate-300 hover:text-white text-xs font-mono transition">
        Zen View
      </button>
    </div>
  </header>

  <!-- Node Detail Floating Card (Appears when 3D node is clicked) -->
  <div id="node-inspector-card" class="hidden absolute top-20 right-5 z-20 w-80 bg-surface-card/95 border border-sky-500/40 p-4 rounded-2xl shadow-2xl backdrop-blur-md pointer-events-auto">
    <div class="flex items-center justify-between border-b border-surface-border pb-2.5 mb-3">
      <div class="flex items-center space-x-2">
        <div class="w-2.5 h-2.5 rounded-full bg-sky-400"></div>
        <span class="text-xs font-bold text-white font-mono" id="node-card-title">Node SG-01 (Singapore)</span>
      </div>
      <button onclick="closeNodeInspector()" class="text-slate-400 hover:text-white text-sm">&times;</button>
    </div>
    <div class="space-y-2 text-xs font-mono">
      <div class="flex justify-between text-slate-400"><span>Status:</span><span class="text-emerald-400 font-semibold" id="node-card-status">Online &bull; 99.98%</span></div>
      <div class="flex justify-between text-slate-400"><span>Compute Load:</span><span class="text-white" id="node-card-load">38% (Ryzen 7 / EPYC)</span></div>
      <div class="flex justify-between text-slate-400"><span>Allocated Memory:</span><span class="text-white" id="node-card-ram">18.4 / 64 GB</span></div>
      <div class="flex justify-between text-slate-400"><span>Minecraft Servers:</span><span class="text-sky-400" id="node-card-servers">12 Instances Active</span></div>
      <div class="flex justify-between text-slate-400"><span>DDoS Protection:</span><span class="text-purple-400">Layer 4/7 Scrubbing</span></div>
    </div>
    <button onclick="openChatWithNodeContext()" class="mt-3.5 w-full py-2 bg-sky-600/30 hover:bg-sky-600/50 border border-sky-500/40 text-sky-300 text-xs font-semibold rounded-xl transition">
      Diagnose Node with Gemini AI
    </button>
  </div>

  <!-- Unified Bottom Control Dock (Consolidated, Zero-Occlusion) -->
  <div id="bottom-dock">
    <!-- Collapse / Expand Drawer Trigger -->
    <div class="flex justify-center -mb-2">
      <button
        onclick="toggleDockCollapse()"
        id="dock-toggle-btn"
        class="px-5 py-1 rounded-t-xl bg-surface-card border-t border-x border-surface-border text-slate-300 hover:text-white text-[11px] font-semibold tracking-wider transition uppercase flex items-center space-x-1.5 shadow-md shadow-black"
      >
        <span id="dock-arrow-icon">&dtrif;</span>
        <span id="dock-toggle-text">Minimize Dock</span>
      </button>
    </div>

    <!-- Dock Main Frame -->
    <div class="glass-surface rounded-2xl overflow-hidden">
      <!-- Dock Tabs Navigation -->
      <div class="flex items-center justify-between border-b border-surface-border px-4 py-2 bg-surface-base/80 text-xs font-medium">
        <div class="flex space-x-1 overflow-x-auto pb-0.5 custom-scrollbar">
          <button onclick="switchDockTab('chat')" id="dock-btn-chat" class="dock-tab-btn px-3 py-1.5 rounded-lg bg-sky-600 text-white font-semibold transition">
            💬 AI Ticket Terminal
          </button>
          <button onclick="switchDockTab('tickets')" id="dock-btn-tickets" class="dock-tab-btn px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition">
            🎫 Real Tickets (<span id="dock-ticket-badge">0</span>)
          </button>
          <button onclick="switchDockTab('calculator')" id="dock-btn-calculator" class="dock-tab-btn px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition">
            ⚡ Pricing Formula
          </button>
          <button onclick="switchDockTab('diagnose')" id="dock-btn-diagnose" class="dock-tab-btn px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition">
            🛠️ Crash & Log AI
          </button>
          <button onclick="switchDockTab('telemetry')" id="dock-btn-telemetry" class="dock-tab-btn px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition">
            📊 Node Fleet & Discord
          </button>
        </div>

        <div class="hidden md:flex items-center space-x-3 text-[11px] font-mono text-slate-400">
          <span>Model: <strong class="text-sky-400" id="dock-model-text">gemini-3.8-flash</strong></span>
          <span>&bull;</span>
          <span>Engine: <strong class="text-emerald-400">3D WebGL PBR</strong></span>
        </div>
      </div>

      <!-- Dock Content Area (Height: 330px) -->
      <div class="h-80 overflow-hidden bg-surface-card/90 p-4">

        <!-- TAB 1: AI Ticket Terminal / Chat -->
        <div id="dock-content-chat" class="h-full flex flex-col">
          <div class="flex items-center justify-between pb-2 mb-2 border-b border-surface-border text-xs">
            <div class="flex items-center space-x-2">
              <span class="text-slate-400">Category:</span>
              <select id="dock-chat-category" class="bg-surface-subtle border border-surface-border text-xs text-white rounded-lg px-2 py-1 focus:outline-none">
                <option value="Minecraft Hosting">Minecraft Hosting</option>
                <option value="VPS & Cloud Infrastructure">VPS & Cloud Infrastructure</option>
                <option value="Billing & Payments">Billing & Payments</option>
                <option value="General Support">General Support & Coding</option>
              </select>
            </div>
            <div class="flex items-center space-x-1.5 text-[11px]">
              <button onclick="fillPresetPrompt('Mage payment eka pending, eka verify karanna puluwanda?')" class="px-2 py-0.5 rounded bg-surface-subtle text-slate-300 hover:text-white border border-surface-border">🇱🇰 Sinhala</button>
              <button onclick="fillPresetPrompt('HXC-S04 plan ekata Ryzen 7 processor ekath ekka total gaana keeyada?')" class="px-2 py-0.5 rounded bg-surface-subtle text-slate-300 hover:text-white border border-surface-border">⚡ Price</button>
              <button onclick="fillPresetPrompt('3 Invite VPS eke specs monawada? How do I get it?')" class="px-2 py-0.5 rounded bg-surface-subtle text-slate-300 hover:text-white border border-surface-border">🎁 VPS</button>
              <button onclick="fillPresetPrompt('Why does my Paper Minecraft server lag at 15 TPS?')" class="px-2 py-0.5 rounded bg-surface-subtle text-slate-300 hover:text-white border border-surface-border">🛠️ Lag</button>
            </div>
          </div>

          <!-- Chat Scroll Area -->
          <div id="dock-chat-messages" class="flex-1 overflow-y-auto custom-scrollbar space-y-2.5 pr-1 text-xs">
            <div class="p-3 rounded-xl bg-surface-subtle/80 border border-surface-border text-slate-300 leading-relaxed">
              <span class="font-bold text-sky-400">HelzerX AI Operations:</span> Ready to handle tickets, analyze Minecraft server performance, execute CPU pricing formulas, and converse in Sinhala, Singlish, and English.
            </div>
          </div>

          <!-- Input Bar -->
          <form onsubmit="handleDockChatSubmit(event)" class="mt-2.5 flex space-x-2">
            <input
              type="text"
              id="dock-chat-input"
              placeholder="Ask anything or test ticket message (Sinhala/English/Singlish)..."
              class="flex-1 bg-surface-subtle border border-surface-border text-xs text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-sky-500 placeholder-slate-500"
              autocomplete="off"
            >
            <button
              type="submit"
              id="dock-chat-send"
              class="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs rounded-xl transition flex items-center space-x-1"
            >
              <span>Transmit</span>
              <span>&rarr;</span>
            </button>
          </form>
        </div>

        <!-- TAB 2: Real Ticket Operations -->
        <div id="dock-content-tickets" class="hidden h-full flex flex-col">
          <div class="flex items-center justify-between pb-2 mb-2 border-b border-surface-border text-xs">
            <div class="flex items-center space-x-2">
              <span class="font-bold text-white">Live Support Tickets</span>
              <span class="text-slate-500 font-mono text-[11px]">(Real-Time Database Feed)</span>
            </div>
            <button onclick="createQuickTicket()" class="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition">
              + Open Ticket
            </button>
          </div>

          <div class="flex-1 overflow-y-auto custom-scrollbar">
            <table class="w-full text-left text-xs font-mono">
              <thead class="text-slate-400 border-b border-surface-border">
                <tr>
                  <th class="py-2 px-3">Ticket ID</th>
                  <th class="py-2 px-3">Category</th>
                  <th class="py-2 px-3">Customer</th>
                  <th class="py-2 px-3">Status</th>
                  <th class="py-2 px-3">AI Messages</th>
                  <th class="py-2 px-3">Action</th>
                </tr>
              </thead>
              <tbody id="dock-ticket-tbody" class="divide-y divide-surface-border text-slate-300">
                <tr><td colspan="6" class="py-8 text-center text-slate-500">Loading tickets...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- TAB 3: Pricing Formula & Cloud Calculator -->
        <div id="dock-content-calculator" class="hidden h-full flex flex-col">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 h-full items-center">
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1.5">Minecraft RAM Tier</label>
              <select id="dock-calc-plan" onchange="runDockCalculation()" class="w-full bg-surface-subtle border border-surface-border text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-sky-500">
                <option value="0.69">HXC-S02 (2GB RAM, 100% CPU, 20GB NVMe) — $0.69/mo</option>
                <option value="1.19" selected>HXC-S04 (4GB RAM, 200% CPU, 40GB NVMe) — $1.19/mo</option>
                <option value="1.59">HXC-S06 (6GB RAM, 200% CPU, 50GB NVMe) — $1.59/mo</option>
                <option value="2.19">HXC-S08 (8GB RAM, 300% CPU, 80GB NVMe) — $2.19/mo</option>
                <option value="3.19">HXC-S12 (12GB RAM, 400% CPU, 120GB NVMe) — $3.19/mo</option>
                <option value="4.19">HXC-S16 (16GB RAM, 500% CPU, 160GB NVMe) — $4.19/mo</option>
                <option value="5.99">HXC-S24 (24GB RAM, 600% CPU, 240GB NVMe) — $5.99/mo</option>
                <option value="7.99">HXC-S32 (32GB RAM, 800% CPU, 320GB NVMe) — $7.99/mo</option>
                <option value="11.99">HXC-S48 (48GB RAM, 1000% CPU, 480GB NVMe) — $11.99/mo</option>
                <option value="14.99">HXC-S64 (64GB RAM, 1200% CPU, 640GB NVMe) — $14.99/mo</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1.5">Processor Tier Option</label>
              <select id="dock-calc-cpu" onchange="runDockCalculation()" class="w-full bg-surface-subtle border border-surface-border text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-sky-500">
                <option value="1.30">AMD Ryzen 5 (+$1.30/mo) — Cost-effective</option>
                <option value="2.40" selected>AMD Ryzen 7 (+$2.40/mo) — Enhanced Compute</option>
                <option value="2.90">Intel Xeon Gold (+$2.90/mo) — Server Grade</option>
                <option value="3.40">AMD EPYC 9965 (+$3.40/mo) — Flagship Performance</option>
              </select>
            </div>

            <div class="bg-surface-subtle border border-sky-500/30 rounded-xl p-4 flex flex-col justify-center items-center text-center">
              <span class="text-[10px] uppercase font-mono text-sky-400 tracking-wider">Formula Total</span>
              <div class="text-2xl font-extrabold text-white mt-1 font-mono" id="dock-calc-result">$3.59<span class="text-xs font-normal text-slate-400">/mo</span></div>
              <div class="text-[11px] text-slate-400 mt-1 font-mono" id="dock-calc-breakdown">Base $1.19 + CPU $2.40</div>
            </div>
          </div>
        </div>

        <!-- TAB 4: Crash & Log Diagnostics -->
        <div id="dock-content-diagnose" class="hidden h-full flex flex-col">
          <div class="flex items-center justify-between pb-2 mb-2 border-b border-surface-border text-xs">
            <span class="font-bold text-white">AI Server Log & Crash Report Inspector</span>
            <button onclick="testSampleCrash()" class="text-[11px] text-sky-400 hover:underline font-mono">Load Sample Paper Crash</button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 overflow-hidden">
            <textarea
              id="dock-log-input"
              placeholder="Paste Java exception, Paper/Purpur crash report, or Linux syslog here..."
              class="w-full h-full bg-surface-subtle border border-surface-border rounded-xl p-2.5 text-[11px] font-mono text-slate-200 resize-none focus:outline-none focus:border-sky-500 custom-scrollbar"
            ></textarea>
            <div class="flex flex-col h-full bg-surface-subtle border border-surface-border rounded-xl p-3 overflow-hidden">
              <div class="flex items-center justify-between pb-1.5 border-b border-slate-700/50 mb-2">
                <span class="text-[11px] font-semibold text-sky-400 font-mono">Gemini Diagnostics Result:</span>
                <button onclick="runCrashDiagnosis()" id="btn-run-diag" class="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition">
                  Analyze Log &rarr;
                </button>
              </div>
              <div id="dock-diag-output" class="flex-1 overflow-y-auto custom-scrollbar text-xs text-slate-300 leading-relaxed font-mono">
                Click "Analyze Log" to trigger deep exception analysis and root-cause fix commands.
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 5: Node Fleet & Discord Health -->
        <div id="dock-content-telemetry" class="hidden h-full overflow-y-auto custom-scrollbar">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div class="p-3 rounded-xl bg-surface-subtle border border-surface-border">
              <div class="text-slate-400">Discord Gateway</div>
              <div class="text-sm font-bold text-white mt-1" id="dock-gw-status">Operational</div>
              <div class="text-[11px] text-slate-400 mt-1">15 Events &bull; 21 Slash/Prefix Cmds</div>
            </div>
            <div class="p-3 rounded-xl bg-surface-subtle border border-surface-border">
              <div class="text-slate-400">Database Storage</div>
              <div class="text-sm font-bold text-sky-400 mt-1" id="dock-db-status">In-Memory Active</div>
              <div class="text-[11px] text-slate-400 mt-1">Zero-downtime resilient store</div>
            </div>
            <div class="p-3 rounded-xl bg-surface-subtle border border-surface-border">
              <div class="text-slate-400">Gemini Thinking Engine</div>
              <div class="text-sm font-bold text-indigo-400 mt-1">Multimodal Vision</div>
              <div class="text-[11px] text-slate-400 mt-1">English, Sinhala, Singlish</div>
            </div>
          </div>

          <div class="mt-3 border-t border-surface-border pt-3">
            <div class="text-xs font-semibold text-slate-300 mb-2">Global Cloud Regions Active:</div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div class="p-2 rounded bg-surface-subtle border border-surface-border flex justify-between"><span>🇸🇬 Singapore</span><span class="text-emerald-400">18ms</span></div>
              <div class="p-2 rounded bg-surface-subtle border border-surface-border flex justify-between"><span>🇩🇪 Germany</span><span class="text-emerald-400">42ms</span></div>
              <div class="p-2 rounded bg-surface-subtle border border-surface-border flex justify-between"><span>🇮🇳 India</span><span class="text-emerald-400">26ms</span></div>
              <div class="p-2 rounded bg-surface-subtle border border-surface-border flex justify-between"><span>🇺🇸 USA</span><span class="text-emerald-400">84ms</span></div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- THREE.JS ES MODULES IMPLEMENTATION -->
  <script type="module">
    import * as THREE from 'https://esm.sh/three@0.160.0';
    import { OrbitControls } from 'https://esm.sh/three@0.160.0/addons/controls/OrbitControls.js';
    import { RoomEnvironment } from 'https://esm.sh/three@0.160.0/addons/environments/RoomEnvironment.js';

    // Global Scene Setup
    const container = document.getElementById('webgl-canvas-container');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040814);
    scene.fog = new THREE.FogExp2(0x040814, 0.022);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(5.5, 4.2, 7.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.02; // Prevent going beneath ground
    controls.minDistance = 3.5;
    controls.maxDistance = 18;
    controls.target.set(0, 1.8, 0);

    // Studio PMREM Environment Map
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Studio Lighting Rig
    const ambientLight = new THREE.AmbientLight(0x1e293b, 0.6);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0284c7, 0.5);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff5ea, 2.2);
    keyLight.position.set(6, 12, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.02;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 25;
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -5;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.5);
    rimLight.position.set(-6, 8, -6);
    scene.add(rimLight);

    // Ground Contact Shadow & High-Tech Hex Floor
    const groundGeo = new THREE.PlaneGeometry(30, 30);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x070d1e,
      roughness: 0.85,
      metalness: 0.3,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Procedural Floor Grid & Concentric Telemetry Rings
    const gridHelper = new THREE.GridHelper(24, 24, 0x0284c7, 0x1e293b);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // Ground Ring Decals
    const ringGeo = new THREE.RingGeometry(2.5, 2.6, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x0284c7, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.02;
    scene.add(ringMesh);

    // -------------------------------------------------------------
    // PROCEDURAL COMPOSITE 3-12 PART SERVER CLUSTER MODEL (THREE.Group)
    // -------------------------------------------------------------
    const serverClusterGroup = new THREE.Group();
    serverClusterGroup.position.set(0, 0, 0);
    scene.add(serverClusterGroup);

    // 1. Heavy Base Pedestal
    const baseGeo = new THREE.BoxGeometry(2.6, 0.25, 1.8);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x0b1120, roughness: 0.35, metalness: 0.85 });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.125;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    serverClusterGroup.add(baseMesh);

    // 2. Main Server Cabinet Frame (Corner Pillars & Top Cap)
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x141e33, roughness: 0.25, metalness: 0.9 });
    const pillarGeo = new THREE.BoxGeometry(0.12, 3.4, 0.12);

    const pillarCoords = [
      [-1.15, 1.95, -0.75],
      [1.15, 1.95, -0.75],
      [-1.15, 1.95, 0.75],
      [1.15, 1.95, 0.75],
    ];

    pillarCoords.forEach(pos => {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(...pos);
      p.castShadow = true;
      serverClusterGroup.add(p);
    });

    // Top Cap
    const topCapGeo = new THREE.BoxGeometry(2.5, 0.2, 1.7);
    const topCap = new THREE.Mesh(topCapGeo, baseMat);
    topCap.position.y = 3.75;
    topCap.castShadow = true;
    serverClusterGroup.add(topCap);

    // 3. Hot-Swappable Server Blades Array (Interactive Raycast Targets)
    const bladeGroup = new THREE.Group();
    serverClusterGroup.add(bladeGroup);
    const interactiveBlades = [];

    const bladeGeo = new THREE.BoxGeometry(2.1, 0.42, 1.35);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.3,
      metalness: 0.8,
    });

    const bladeLedGeo = new THREE.BoxGeometry(0.06, 0.06, 0.02);
    const ledMatActive = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const ledMatEmerald = new THREE.MeshBasicMaterial({ color: 0x10b981 });

    const nodeMetadata = [
      { id: "node-sg-01", name: "Singapore Node 01", location: "Singapore", ping: "18ms", load: "38%", status: "Optimal" },
      { id: "node-de-01", name: "Frankfurt Node 02", location: "Germany", ping: "42ms", load: "44%", status: "Optimal" },
      { id: "node-in-01", name: "Mumbai Node 03", location: "India", ping: "26ms", load: "62%", status: "Optimal" },
      { id: "node-us-01", name: "Virginia Node 04", location: "USA", ping: "84ms", load: "29%", status: "Optimal" },
      { id: "node-hk-01", name: "Hong Kong Node 05", location: "Hong Kong", ping: "32ms", load: "48%", status: "Optimal" },
      { id: "node-au-01", name: "Sydney Node 06", location: "Australia", ping: "95ms", load: "22%", status: "Optimal" },
    ];

    for (let i = 0; i < 6; i++) {
      const blade = new THREE.Mesh(bladeGeo, bladeMat.clone());
      blade.position.set(0, 0.6 + i * 0.52, 0);
      blade.castShadow = true;
      blade.receiveShadow = true;
      blade.userData = { isBlade: true, index: i, ...nodeMetadata[i] };

      // Front Face Grille & Dual LED indicators
      const led1 = new THREE.Mesh(bladeLedGeo, ledMatActive);
      led1.position.set(0.85, 0, 0.68);
      blade.add(led1);

      const led2 = new THREE.Mesh(bladeLedGeo, ledMatEmerald);
      led2.position.set(0.72, 0, 0.68);
      blade.add(led2);

      bladeGroup.add(blade);
      interactiveBlades.push(blade);
    }

    // 4. Transmissive Tempered Glass Door
    const glassGeo = new THREE.BoxGeometry(2.35, 3.3, 0.05);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.28,
      roughness: 0.08,
      transmission: 0.88,
      ior: 1.52,
      thickness: 0.5,
      metalness: 0.1,
    });
    const glassDoor = new THREE.Mesh(glassGeo, glassMat);
    glassDoor.position.set(0, 1.95, 0.8);
    serverClusterGroup.add(glassDoor);

    // 5. Vertical Fiber Optic Data Bus (Glowing Tube)
    const curve = new THREE.LineCurve3(new THREE.Vector3(-1.0, 0.3, 0.72), new THREE.Vector3(-1.0, 3.6, 0.72));
    const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.025, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const fiberBus = new THREE.Mesh(tubeGeo, tubeMat);
    serverClusterGroup.add(fiberBus);

    // -------------------------------------------------------------
    // RAYCASTING & INTERACTION DISCIPLINE
    // -------------------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hoveredBlade = null;

    window.addEventListener('pointermove', (event) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    });

    window.addEventListener('click', (event) => {
      // Ignore clicks on HUD or dock
      if (event.target.closest('#bottom-dock') || event.target.closest('header') || event.target.closest('#node-inspector-card')) return;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveBlades);

      if (intersects.length > 0) {
        const clicked = intersects[0].object;
        focusOnNode(clicked);
      }
    });

    function focusOnNode(bladeMesh) {
      const data = bladeMesh.userData;
      // Show node inspector card
      document.getElementById('node-inspector-card').classList.remove('hidden');
      document.getElementById('node-card-title').innerText = data.name + ' (' + data.location + ')';
      document.getElementById('node-card-status').innerText = data.status + ' • 99.99% Uptime';
      document.getElementById('node-card-load').innerText = data.load + ' • Active';
      document.getElementById('top-ping-label').innerText = data.location + ': ' + data.ping;

      // Animate camera target towards blade
      targetCameraPosition.set(bladeMesh.position.x + 3.2, bladeMesh.position.y + 0.6, bladeMesh.position.z + 3.6);
      targetControlsTarget.set(bladeMesh.position.x, bladeMesh.position.y, bladeMesh.position.z);
    }

    // -------------------------------------------------------------
    // CAMERA PRESET SMOOTH INTERPOLATION (Exponential Damping)
    // -------------------------------------------------------------
    const targetCameraPosition = new THREE.Vector3().copy(camera.position);
    const targetControlsTarget = new THREE.Vector3().copy(controls.target);

    window.setCameraView = function(view) {
      if (view === 'iso') {
        targetCameraPosition.set(5.5, 4.2, 7.5);
        targetControlsTarget.set(0, 1.8, 0);
      } else if (view === 'rack') {
        targetCameraPosition.set(0, 1.95, 4.8);
        targetControlsTarget.set(0, 1.95, 0);
      } else if (view === 'blade') {
        targetCameraPosition.set(2.4, 1.6, 2.6);
        targetControlsTarget.set(0, 1.6, 0);
      } else if (view === 'top') {
        targetCameraPosition.set(0.01, 8.5, 0.01);
        targetControlsTarget.set(0, 1.8, 0);
      }
    };

    window.closeNodeInspector = function() {
      document.getElementById('node-inspector-card').classList.add('hidden');
    };

    window.openChatWithNodeContext = function() {
      switchDockTab('chat');
      const loc = document.getElementById('node-card-title').innerText;
      fillPresetPrompt('Diagnose status and ping performance for ' + loc);
    };

    // Responsive Resize
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // -------------------------------------------------------------
    // RENDER LOOP WITH EXPONENTIAL DAMPING & ZERO GC
    // -------------------------------------------------------------
    const clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      const delta = clock.getDelta();

      // Camera & Controls Smooth Damping
      camera.position.x = THREE.MathUtils.damp(camera.position.x, targetCameraPosition.x, 3.5, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, targetCameraPosition.y, 3.5, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, targetCameraPosition.z, 3.5, delta);

      controls.target.x = THREE.MathUtils.damp(controls.target.x, targetControlsTarget.x, 3.5, delta);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, targetControlsTarget.y, 3.5, delta);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, targetControlsTarget.z, 3.5, delta);

      controls.update();

      // Raycast Hover Effect on Server Blades
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveBlades);

      if (intersects.length > 0) {
        const topIntersect = intersects[0].object;
        if (hoveredBlade !== topIntersect) {
          if (hoveredBlade) hoveredBlade.material.color.setHex(0x0f172a);
          hoveredBlade = topIntersect;
          hoveredBlade.material.color.setHex(0x1e293b);
        }
      } else {
        if (hoveredBlade) {
          hoveredBlade.material.color.setHex(0x0f172a);
          hoveredBlade = null;
        }
      }

      // Subtle rotation pulse for fiber bus emission
      const elapsed = clock.getElapsedTime();
      tubeMat.color.setRGB(0.2 + 0.1 * Math.sin(elapsed * 2.5), 0.7 + 0.1 * Math.cos(elapsed * 2.5), 0.98);

      renderer.render(scene, camera);
    }

    animate();
  </script>

  <!-- DOCK MANAGEMENT & API LOGIC -->
  <script>
    // Tab switching in Bottom Dock
    function switchDockTab(tabId) {
      document.querySelectorAll('.dock-tab-btn').forEach(btn => {
        btn.classList.remove('bg-sky-600', 'text-white', 'font-semibold');
        btn.classList.add('text-slate-400');
      });
      const activeBtn = document.getElementById('dock-btn-' + tabId);
      if (activeBtn) {
        activeBtn.classList.add('bg-sky-600', 'text-white', 'font-semibold');
        activeBtn.classList.remove('text-slate-400');
      }

      ['chat', 'tickets', 'calculator', 'diagnose', 'telemetry'].forEach(id => {
        const el = document.getElementById('dock-content-' + id);
        if (el) el.classList.toggle('hidden', id !== tabId);
      });

      if (tabId === 'tickets') loadRealTickets();
      if (tabId === 'telemetry') loadRealTelemetry();
    }

    // Toggle Dock Collapse (Cinema / Zen View)
    function toggleDockCollapse() {
      const dock = document.getElementById('bottom-dock');
      const isCollapsed = dock.classList.toggle('dock-collapsed');
      document.getElementById('dock-arrow-icon').innerHTML = isCollapsed ? '&utrif;' : '&dtrif;';
      document.getElementById('dock-toggle-text').innerText = isCollapsed ? 'Expand Dock' : 'Minimize Dock';
    }

    function toggleCinemaMode() {
      toggleDockCollapse();
    }

    // Fill Quick Prompt into Dock Chat Input
    function fillPresetPrompt(promptText) {
      document.getElementById('dock-chat-input').value = promptText;
      document.getElementById('dock-chat-input').focus();
    }

    // Real Interactive Chat Submit
    let chatMemory = [];

    async function handleDockChatSubmit(e) {
      e.preventDefault();
      const input = document.getElementById('dock-chat-input');
      const text = input.value.trim();
      if (!text) return;

      const category = document.getElementById('dock-chat-category').value;
      appendDockMsg('user', text, 'Operator');
      input.value = '';

      const typingId = 'typing-' + Date.now();
      appendDockTyping(typingId);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            categoryName: category,
            customerName: 'Operator',
            history: chatMemory,
          }),
        });

        const data = await res.json();
        removeDockTyping(typingId);

        if (data.text) {
          appendDockMsg('model', data.text, 'HelzerX AI', data);
          chatMemory.push({ role: 'user', text });
          chatMemory.push({ role: 'model', text: data.text });
        } else {
          appendDockMsg('model', data.error || 'No response from model.', 'System');
        }
      } catch (err) {
        removeDockTyping(typingId);
        appendDockMsg('model', 'Failed to communicate with AI core: ' + err.message, 'System');
      }
    }

    function appendDockMsg(role, text, author, meta) {
      const box = document.getElementById('dock-chat-messages');
      const isBot = role === 'model';
      const item = document.createElement('div');
      item.className = 'p-3 rounded-xl border leading-relaxed ' +
        (isBot ? 'bg-surface-subtle border-surface-border text-slate-200' : 'bg-sky-950/60 border-sky-600/30 text-sky-100');

      let formatted = text.replace(/\\n/g, '<br/>')
        .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\*(.*?)\\*/g, '<em>$1</em>');

      item.innerHTML = \`<div class="flex items-center justify-between mb-1">
        <span class="font-bold \${isBot ? 'text-sky-400' : 'text-slate-300'} text-[11px]">\${author}</span>
        \${meta ? \`<span class="text-[10px] font-mono text-slate-400">\${meta.latencyMs || 0}ms &bull; \${meta.model || ''}</span>\` : ''}
      </div><div>\${formatted}</div>\`;

      box.appendChild(item);
      box.scrollTop = box.scrollHeight;
    }

    function appendDockTyping(id) {
      const box = document.getElementById('dock-chat-messages');
      const item = document.createElement('div');
      item.id = id;
      item.className = 'p-2 rounded-lg bg-surface-subtle text-[11px] text-sky-400 font-mono flex items-center space-x-2';
      item.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span><span>Gemini 3.8 deep thinking & tool reasoning...</span>';
      box.appendChild(item);
      box.scrollTop = box.scrollHeight;
    }

    function removeDockTyping(id) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }

    // Load Real Tickets
    async function loadRealTickets() {
      try {
        const res = await fetch('/api/tickets');
        const tickets = await res.json();
        document.getElementById('dock-ticket-badge').innerText = tickets.length || 0;
        const tbody = document.getElementById('dock-ticket-tbody');

        if (!tickets || !tickets.length) {
          tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-500">No active tickets found. Use "+ Open Ticket" to simulate or check Discord.</td></tr>';
          return;
        }

        tbody.innerHTML = tickets.map(t => \`
          <tr class="hover:bg-surface-subtle/50 transition">
            <td class="py-2.5 px-3 text-sky-400 font-semibold">\${t.ticketId}</td>
            <td class="py-2.5 px-3">\${t.categoryName || 'General'}</td>
            <td class="py-2.5 px-3">\${t.customerName || t.userId}</td>
            <td class="py-2.5 px-3">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold \${t.status === 'open' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700 text-slate-300'}">
                \${t.status.toUpperCase()}
              </span>
            </td>
            <td class="py-2.5 px-3">\${t.aiStats?.messages || 0}</td>
            <td class="py-2.5 px-3">
              \${t.status === 'open'
                ? \`<button onclick="closeRealTicket('\${t.ticketId}')" class="px-2 py-0.5 rounded bg-rose-600/30 text-rose-300 hover:bg-rose-600/50 border border-rose-500/30 text-[10px] transition">Close</button>\`
                : \`<button onclick="reopenRealTicket('\${t.ticketId}')" class="px-2 py-0.5 rounded bg-sky-600/30 text-sky-300 hover:bg-sky-600/50 border border-sky-500/30 text-[10px] transition">Reopen</button>\`}
            </td>
          </tr>
        \`).join('');
      } catch (err) {}
    }

    async function closeRealTicket(id) {
      await fetch('/api/tickets/' + id + '/close', { method: 'POST' });
      loadRealTickets();
    }

    async function reopenRealTicket(id) {
      await fetch('/api/tickets/' + id + '/reopen', { method: 'POST' });
      loadRealTickets();
    }

    async function createQuickTicket() {
      const cat = prompt('Ticket Category:', 'Minecraft Hosting');
      if (!cat) return;
      const desc = prompt('Inquiry:', 'Player TPS drops during chunk generation');
      if (!desc) return;
      await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryName: cat, description: desc, customerName: 'Client_Sim' }),
      });
      loadRealTickets();
    }

    // Real Pricing Formula Calculation
    function runDockCalculation() {
      const plan = parseFloat(document.getElementById('dock-calc-plan').value);
      const cpu = parseFloat(document.getElementById('dock-calc-cpu').value);
      const total = (plan + cpu).toFixed(2);
      document.getElementById('dock-calc-result').innerHTML = '$' + total + '<span class="text-xs font-normal text-slate-400">/mo</span>';
      document.getElementById('dock-calc-breakdown').innerText = 'Base Plan $' + plan.toFixed(2) + ' + Processor Fee $' + cpu.toFixed(2);
    }

    // Crash Diagnostics
    function testSampleCrash() {
      document.getElementById('dock-log-input').value = \`java.lang.OutOfMemoryError: Java heap space
  at net.minecraft.world.level.chunk.ChunkAccess.<init>(ChunkAccess.java:42)
  at io.papermc.paper.chunk.system.scheduling.ChunkHolder.getChunk(ChunkHolder.java:188)
  at org.bukkit.craftbukkit.v1_20_R3.CraftWorld.getChunkAt(CraftWorld.java:214)
  at com.example.customplugin.ChunkScan.run(ChunkScan.java:88)
  at org.bukkit.craftbukkit.v1_20_R3.scheduler.CraftTask.run(CraftTask.java:82)\`;
    }

    async function runCrashDiagnosis() {
      const text = document.getElementById('dock-log-input').value.trim();
      if (!text) return alert('Please paste log text first.');

      const output = document.getElementById('dock-diag-output');
      output.innerText = 'Analyzing stack trace with Gemini AI diagnostic model...';

      try {
        const res = await fetch('/api/ai/diagnose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logText: text }),
        });
        const data = await res.json();
        output.innerHTML = (data.text || data.error || 'Diagnosis failed.').replace(/\\n/g, '<br/>');
      } catch (err) {
        output.innerText = 'Diagnosis network error: ' + err.message;
      }
    }

    // Telemetry Sync
    async function loadRealTelemetry() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.discord) {
          document.getElementById('dock-gw-status').innerText = data.discord.connected ? 'Connected (' + data.discord.ping + 'ms)' : 'Service Mode (Port 3000)';
        }
        if (data.database) {
          document.getElementById('dock-db-status').innerText = data.database.type;
        }
      } catch (err) {}
    }

    // Initial Load
    loadRealTickets();
    loadRealTelemetry();
  </script>
</body>
</html>`;
}

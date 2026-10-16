# HelzerX Technologies AI Ticket Manager

HelzerX Technologies's Discord ticket system with a Gemini-powered operational support agent.

## What it does

This is intentionally more than a chatbot. The AI can understand natural Discord messages, inspect real customer state, use allowlisted tools, perform approved support operations, and hand tickets to staff when human intervention is required.

### Autonomous VPS example

A customer can simply say:

> mata 3 invite plan vps ekak one

The AI can:

1. Check the customer's tracked successful invites.
2. Check the configured invite VPS plan.
3. Verify eligibility.
4. Inspect the VPS bot's available nodes.
5. Inspect supported operating systems.
6. Automatically choose a suitable node and OS.
7. Send the provisioning request to the separate Helzer-vps service.
8. Receive the real VPS result.
9. Tell the customer the actual resources, node, OS, duration and status.
10. Point the customer to the configured feedback channel.

The customer is not asked to operate the VPS creation workflow manually.

## Architecture

~~~
Discord customer
      |
      v
HelzerX AI Ticket Manager
      |
      +-- Gemini reasoning
      +-- Ticket memory
      +-- Invite tracking
      +-- Support / escalation tools
      |
      v
Private VPS Agent API
      |
      v
Helzer-vps
      |
      +-- node capacity
      +-- OS catalog
      +-- Docker provisioning
      +-- VPS lifecycle
~~~

Gemini function calling is used as the bridge between natural-language requests and application-side tools. The model proposes a structured tool call; the application executes it and sends the result back to Gemini for the final customer-facing response.

## Environment

~~~
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
MONGODB_URI=

AI_ENABLED=true
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
AI_AUTO_ACTIONS=false
AI_MAX_TOOL_ROUNDS=8
AI_COOLDOWN_MS=1800
AI_HISTORY_LIMIT=16
AI_STAFF_SILENCE_MS=300000

VPS_BOT_API_URL=http://127.0.0.1:8787
VPS_BOT_API_TOKEN=

AI_FEEDBACK_CHANNEL_ID=1552629200714866718
~~~

## Security model

- Gemini never receives arbitrary shell or Docker access.
- Tool implementations enforce customer ownership and server-side validation.
- VPS deletion is staff-controlled from the AI support layer.
- Secrets are never requested from customers.
- Staff takeover pauses AI replies for the ticket.
- The VPS bridge is bearer-token protected.
- The VPS bot remains the actual infrastructure executor.

## Tests

~~~
npm install
npm test
npm run test:syntax
~~~

Runtime integration with Discord, MongoDB, Gemini, the HelzerX business API and the VPS agent must be tested in a staging environment before production use. Keep `AI_AUTO_ACTIONS=false` until ownership fields, business API permissions, and VPS action behavior have been verified. Never commit real tokens or `.env` files.

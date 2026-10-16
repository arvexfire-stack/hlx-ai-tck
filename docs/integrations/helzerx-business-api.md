# HelzerX Business API Contract

The AI ticket bot uses one authenticated business API boundary for non-VPS services.

## Authentication

Every request sends:

`Authorization: Bearer <HELZERX_API_TOKEN>`

The bot expects JSON responses and treats non-2xx responses as failures.

## Endpoints

- `GET /v1/agent/health`
- `GET /v1/agent/customers/:discordUserId`
- `GET /v1/agent/customers/:discordUserId/services`
- `GET /v1/agent/customers/:discordUserId/orders`
- `GET /v1/agent/invoices/:invoiceId`
- `GET /v1/agent/payments/:paymentId`
- `POST /v1/agent/payment-links`
- `GET /v1/agent/customers/:discordUserId/domains`
- `GET /v1/agent/customers/:discordUserId/minecraft`
- `GET /v1/agent/customers/:discordUserId/ai-agents`

## Payment safety

The AI can inspect invoice/payment state and request an official payment link. It must not claim a payment succeeded without the API confirming it.

Refunds, reversals, disputes, and other money-moving operations should only be exposed later as separately authorized endpoints with server-side permission checks and audit logging.

## Response contract

Responses should be JSON objects. Customer-owned resources should include a stable `user_id` when possible so the bot can verify ownership before displaying data.

Do not return passwords, API tokens, private keys, or full payment card data to the AI layer.

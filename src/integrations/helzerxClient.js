import { config } from "#config/config";

export class HelzerXClient {
  constructor({
    baseUrl = config.business.apiUrl,
    token = config.business.apiToken,
    timeoutMs = config.business.timeoutMs,
  } = {}) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  get enabled() {
    return Boolean(this.baseUrl && this.token);
  }

  async request(path, options = {}) {
    if (!this.enabled) throw new Error("HelzerX business API integration is not configured.");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.baseUrl + path, {
        ...options,
        headers: {
          Authorization: "Bearer " + this.token,
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "HelzerX business API returned HTTP " + response.status);
      }

      return payload;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("HelzerX business API request timed out.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  health() {
    return this.request("/v1/agent/health");
  }

  customer(userId) {
    return this.request("/v1/agent/customers/" + encodeURIComponent(userId));
  }

  services(userId) {
    return this.request("/v1/agent/customers/" + encodeURIComponent(userId) + "/services");
  }

  orders(userId) {
    return this.request("/v1/agent/customers/" + encodeURIComponent(userId) + "/orders");
  }

  invoice(invoiceId) {
    return this.request("/v1/agent/invoices/" + encodeURIComponent(invoiceId));
  }

  payment(paymentId) {
    return this.request("/v1/agent/payments/" + encodeURIComponent(paymentId));
  }

  createPaymentLink(input) {
    return this.request("/v1/agent/payment-links", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  domains(userId) {
    return this.request("/v1/agent/customers/" + encodeURIComponent(userId) + "/domains");
  }

  minecraft(userId) {
    return this.request("/v1/agent/customers/" + encodeURIComponent(userId) + "/minecraft");
  }

  catalog() {
    return this.request("/v1/agent/catalog");
  }

  service(serviceId) {
    return this.request("/v1/agent/services/" + encodeURIComponent(serviceId));
  }

  serviceAction(input) {
    return this.request("/v1/agent/service-actions", { method: "POST", body: JSON.stringify(input) });
  }

  aiAgents(userId) {
    return this.request("/v1/agent/customers/" + encodeURIComponent(userId) + "/ai-agents");
  }
}

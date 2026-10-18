import test from "node:test";
import assert from "node:assert/strict";
import { listHelzerXSites, readHelzerXWebsite, searchHelzerXWebsites, searchWeb } from "../src/ai/webIntelligence.js";

test("lists all five official HelzerX websites", () => {
  const sites = listHelzerXSites();
  assert.equal(sites.length, 5);
  assert.deepEqual(sites.map((site) => site.url), [
    "https://www.helzerx.cyou",
    "https://cloud.helzerx.cyou",
    "https://studio.helzerx.cyou",
    "https://free.helzerx.cyou",
    "https://sgp.helzerx.cyou",
  ]);
});

test("rejects non-HelzerX URLs before making a network request", async () => {
  await assert.rejects(
    readHelzerXWebsite("https://example.com"),
    /only HTTPS pages on official HelzerX domains/,
  );
});

test("rejects HTTP URLs", async () => {
  await assert.rejects(
    readHelzerXWebsite("http://cloud.helzerx.cyou"),
    /only HTTPS pages on official HelzerX domains/,
  );
});

test("rejects malformed URLs", async () => {
  await assert.rejects(
    readHelzerXWebsite("not-a-url"),
    /valid URL from an official HelzerX website/,
  );
});


test("rejects official-domain URLs that specify a non-standard HTTPS port", async () => {
  await assert.rejects(
    readHelzerXWebsite("https://cloud.helzerx.cyou:8443"),
    /standard HTTPS port/,
  );
});

test("rejects URLs with embedded credentials", async () => {
  await assert.rejects(
    readHelzerXWebsite("https://user:pass@cloud.helzerx.cyou"),
    /only HTTPS pages on official HelzerX domains/,
  );
});

test("rejects empty or one-character web search queries", async () => {
  await assert.rejects(searchWeb(""), /at least two characters/);
  await assert.rejects(searchWeb("x"), /at least two characters/);
});

test("uses Tavily and bounds returned search results", async () => {
  const previousKey = process.env.TAVILY_API_KEY;
  const previousBraveKey = process.env.BRAVE_SEARCH_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.TAVILY_API_KEY = "test-key";
  delete process.env.BRAVE_SEARCH_API_KEY;
  let requestBody;

  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      results: Array.from({ length: 7 }, (_, index) => ({
        title: "Result " + index,
        url: "https://example.com/" + index,
        content: "Content " + index,
        score: index / 10,
      })),
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await searchWeb("HelzerX pricing");
    assert.equal(requestBody.query, "HelzerX pricing");
    assert.equal(result.provider, "Tavily");
    assert.equal(result.results.length, 5);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previousKey;
    if (previousBraveKey === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY = previousBraveKey;
  }
});


test("searches official HelzerX homepages and follows relevant same-domain pricing links", async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url.href);
    const content = url.pathname === "/pricing"
      ? "<html><body><h1>VPS Pricing</h1><p>12GB VPS plan price: $9 per month.</p></body></html>"
      : '<html><body><h1>HelzerX hosting</h1><a href="/pricing">VPS Pricing</a></body></html>';
    return new Response(content, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };

  try {
    const result = await searchHelzerXWebsites("12GB VPS price", { maxPages: 6 });
    assert.ok(requests.some((url) => new URL(url).hostname === "cloud.helzerx.cyou"));
    assert.ok(result.results.some((page) => new URL(page.url).pathname === "/pricing"));
    assert.ok(result.results.every((page) => page.url.startsWith("https://")));
    assert.ok(result.pagesChecked <= 6);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { listHelzerXSites, readHelzerXWebsite } from "../src/ai/webIntelligence.js";

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

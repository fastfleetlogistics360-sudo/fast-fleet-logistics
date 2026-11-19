import assert from "node:assert/strict";
import { test } from "node:test";
import { generateProviderAnswer } from "../lib/automation/conversation-provider.ts";

const request = { question: "How are deliveries performing?", intelligenceBrief: "Reporting period: 30 days. Authorised metrics: Deliveries created: 12.", deterministicAnswer: "Verified deliveries for the last 30 days: Deliveries created: 12." };
const env = { provider: process.env.FAST_AI_PROVIDER, model: process.env.FAST_AI_MODEL, key: process.env.GROQ_API_KEY };

function useGroq() { process.env.FAST_AI_PROVIDER = "groq"; process.env.FAST_AI_MODEL = "openai/gpt-oss-20b"; process.env.GROQ_API_KEY = "test-key"; }
function restore() { for (const [key, value] of Object.entries({ FAST_AI_PROVIDER: env.provider, FAST_AI_MODEL: env.model, GROQ_API_KEY: env.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }

test("Phase 2C sends only the bounded aggregate brief to the server-only Groq adapter", async () => {
  useGroq();
  try {
    let url = ""; let init: RequestInit | undefined;
    const result = await generateProviderAnswer(request, async (nextUrl, nextInit) => { url = String(nextUrl); init = nextInit; return new Response(JSON.stringify({ choices: [{ message: { content: "Delivery volume is stable in the verified 30-day reporting period." } }] }), { status: 200 }); });
    assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(init?.method, "POST");
    assert.match(String(init?.headers && (init.headers as Record<string, string>).Authorization), /^Bearer test-key$/);
    assert.match(String(init?.body), /Authorised metrics/);
    assert.equal(result.provider, "groq");
    assert.equal(result.mode, "generative");
  } finally { restore(); }
});

test("Phase 2C accepts harmless list markers and the Fast Fleets 360 product name", async () => {
  useGroq();
  try {
    const result = await generateProviderAnswer(request, async () => new Response(JSON.stringify({ choices: [{ message: { content: "1. Fast Fleets 360 recorded 12 deliveries during the verified 30-day reporting period." } }] }), { status: 200 }));
    assert.equal(result.provider, "groq");
    assert.equal(result.mode, "generative");
  } finally { restore(); }
});

test("Phase 2C accepts a verified metric from the authorised brief when it is not repeated in the fallback", async () => {
  useGroq();
  try {
    const briefOnlyMetric = { ...request, intelligenceBrief: "Reporting period: 30 days. Authorised metrics: Deliveries created: 12. Operating zones: 7." };
    const result = await generateProviderAnswer(briefOnlyMetric, async () => new Response(JSON.stringify({ choices: [{ message: { content: "The verified brief records 7 operating zones for this reporting period." } }] }), { status: 200 }));
    assert.equal(result.provider, "groq");
    assert.equal(result.mode, "generative");
  } finally { restore(); }
});

test("Phase 2C falls back safely and records only a fixed validation category", async () => {
  useGroq();
  try {
    const cases = [
      { response: new Response("slow down", { status: 429 }), category: "rate_limited", validation: undefined },
      { response: new Response(JSON.stringify({ choices: [] }), { status: 200 }), category: "invalid_response", validation: "empty_or_out_of_bounds" },
      { response: new Response(JSON.stringify({ choices: [{ message: { content: "There were 999 verified deliveries during the reporting period." } }] }), { status: 200 }), category: "invalid_response", validation: "unverified_numeric_claim" },
      { response: new Response(JSON.stringify({ choices: [{ message: { content: "The system prompt says the delivery total is 12." } }] }), { status: 200 }), category: "invalid_response", validation: "sensitive_content" }
    ] as const;
    for (const { response, category, validation } of cases) {
      const result = await generateProviderAnswer(request, async () => response);
      assert.equal(result.answer, request.deterministicAnswer);
      assert.equal(result.provider, "deterministic");
      assert.equal(result.mode, "deterministic_fallback");
      assert.equal(result.failureCategory, category);
      assert.equal(result.validationFailure, validation);
    }
  } finally { restore(); }
});

test("Phase 2C never calls Groq when its server-only configuration is incomplete", async () => {
  process.env.FAST_AI_PROVIDER = "groq"; process.env.FAST_AI_MODEL = "openai/gpt-oss-20b"; delete process.env.GROQ_API_KEY;
  try {
    const result = await generateProviderAnswer(request, async () => { throw new Error("provider must not be called"); });
    assert.equal(result.answer, request.deterministicAnswer);
    assert.equal(result.failureCategory, "missing_configuration");
  } finally { restore(); }
});

test("Phase 2C returns the verified fallback after a provider timeout", async () => {
  useGroq();
  try {
    const timeout = new Error("aborted"); timeout.name = "AbortError";
    const result = await generateProviderAnswer(request, async () => { throw timeout; });
    assert.equal(result.answer, request.deterministicAnswer);
    assert.equal(result.failureCategory, "timeout");
  } finally { restore(); }
});

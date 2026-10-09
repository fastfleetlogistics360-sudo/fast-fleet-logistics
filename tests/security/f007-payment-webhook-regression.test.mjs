import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = new URL("../../", import.meta.url);
const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const squadSecret = "squad-webhook-test-secret-that-is-never-a-real-key";

function loadWebhookModule() {
  const source = read("lib/payments/squad-webhook.ts").replace(
    'import { getSquadSecretKey } from "@/lib/payments/squad";',
    "const { getSquadSecretKey } = __deps;"
  );
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(output, {
    module: compiledModule,
    exports: compiledModule.exports,
    require,
    Buffer,
    __deps: { getSquadSecretKey: () => squadSecret }
  });
  return compiledModule.exports;
}

const webhook = loadWebhookModule();
const signed = (body) => crypto.createHmac("sha512", squadSecret).update(body, "utf8").digest("hex");
const validBody = JSON.stringify({ Event: "charge_successful", transaction_ref: "FFD-12345678-ABCD", transaction_status: "Success", transaction_amount: 125000, transaction_currency_id: "NGN" });
const documentedSquadBody = JSON.stringify({
  Event: "charge_successful",
  TransactionRef: "FFW-12345678-ABCD",
  Body: {
    amount: 125000,
    transaction_ref: "FFW-12345678-ABCD",
    gateway_ref: "FFW-12345678-ABCD_1_2_3",
    transaction_status: "Success",
    currency: "NGN"
  }
});

test("F-007 validates genuine standard-payment webhooks using HMAC-SHA512", () => {
  assert.equal(webhook.verifySquadWebhookSignature(validBody, signed(validBody)).valid, true);
  assert.equal(webhook.verifySquadWebhookSignature(validBody, signed(validBody).toUpperCase()).valid, true);
});

test("F-007 rejects missing, non-hex, wrong-length, forged, modified, and empty webhook bodies", () => {
  const malformed = [null, "not-hex", "a".repeat(127), "0".repeat(128), signed(`${validBody}x`)];
  for (const signature of malformed) {
    assert.equal(webhook.verifySquadWebhookSignature(validBody, signature).valid, false);
  }
  assert.equal(webhook.verifySquadWebhookSignature("", signed("")).valid, false);
  assert.equal(webhook.verifySquadWebhookSignature(`${validBody} `, signed(validBody)).valid, false);
});

test("F-007 parses only identified standard payment events and derives replay-safe digests without storing bodies", () => {
  const parsed = webhook.parseSquadStandardPaymentWebhook(JSON.parse(validBody));
  assert.equal(parsed.eventType, "charge_successful");
  assert.equal(parsed.providerReference, "FFD-12345678-ABCD");
  assert.equal(parsed.providerStatus, "Success");
  assert.equal(parsed.gatewayReference, null);
  assert.equal(webhook.isSuccessfulSquadWebhookEvent(parsed), true);
  assert.equal(webhook.parseSquadStandardPaymentWebhook({ Event: "charge_successful" }), null);
  assert.equal(webhook.isSuccessfulSquadWebhookEvent({ ...parsed, eventType: "refund" }), false);
  assert.match(webhook.squadWebhookPayloadDigest(validBody), /^[a-f0-9]{64}$/);
  assert.match(webhook.squadWebhookEventKey(parsed), /^[a-f0-9]{64}$/);
});

test("F-007 accepts Squad's documented capitalized standard-payment webhook body", () => {
  const parsed = webhook.parseSquadStandardPaymentWebhook(JSON.parse(documentedSquadBody));
  assert.equal(parsed.eventType, "charge_successful");
  assert.equal(parsed.providerReference, "FFW-12345678-ABCD");
  assert.equal(parsed.providerStatus, "Success");
  assert.equal(parsed.gatewayReference, "FFW-12345678-ABCD_1_2_3");
  assert.equal(webhook.verifySquadWebhookSignature(documentedSquadBody, signed(documentedSquadBody)).valid, true);
});

test("F-007 webhook route keeps raw-body validation ahead of parsing and returns no-store responses", () => {
  const route = read("app/api/payments/squad/webhook/route.ts");
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /const rawBody = await request\.text\(\)/);
  assert.match(route, /verifySquadWebhookSignature\(rawBody/);
  assert.ok(route.indexOf("verifySquadWebhookSignature(rawBody") < route.indexOf("JSON.parse(rawBody)"));
  assert.match(route, /Cache-Control", "no-store"/);
  assert.doesNotMatch(route, /console\.(log|info|error)\(/);
});

test("F-007 has durable payment intents and minimal replay receipts with no raw payload column", () => {
  const migration = read("supabase-payment-webhook-reconciliation-delta.sql");
  assert.match(migration, /create table if not exists public\.payment_intents/);
  assert.match(migration, /expected_amount_minor bigint not null/);
  assert.match(migration, /unique \(provider, provider_transaction_reference\)/);
  assert.match(migration, /unique \(internal_reference\)/);
  assert.match(migration, /marketplace_business_order/);
  assert.match(migration, /create table if not exists public\.payment_webhook_receipts/);
  assert.match(migration, /unique \(provider, event_key\)/);
  assert.doesNotMatch(migration, /raw_(body|payload)|webhook_payload\s+jsonb/i);
});

test("F-007 database settlement locks targets, prevents downgrade, and credits business value once", () => {
  const migration = read("supabase-payment-webhook-reconciliation-delta.sql");
  assert.match(migration, /for update/);
  assert.match(migration, /Settled payment intents cannot be downgraded/);
  assert.match(migration, /on conflict \(provider_reference\) do nothing\n\s+returning id into business_credit_transaction_id/);
  assert.match(migration, /if business_credit_transaction_id is not null then/);
  assert.match(migration, /company_transaction_logs_squad_reference_unique_idx/);
  assert.match(migration, /begin;/);
  assert.match(migration, /commit;/);
});

test("F-007 shared settlement verifies exact reference, integer minor amount, currency, and final success", () => {
  const settlement = read("lib/payments/settlement.ts");
  assert.match(settlement, /transaction\.reference === intent\.provider_transaction_reference/);
  assert.match(settlement, /transaction\.amountMinor === Number\(intent\.expected_amount_minor\)/);
  assert.match(settlement, /transaction\.currency\.trim\(\)\.toUpperCase\(\) === intent\.currency/);
  assert.match(settlement, /isSuccessfulSquadStatus\(providerStatus\)/);
  assert.match(settlement, /settle_squad_payment_intent/);
  assert.match(settlement, /PAYMENT_AMOUNT_MISMATCH/);
  assert.match(settlement, /PAYMENT_CURRENCY_MISMATCH/);
});

test("F-007 browser, webhook, reconciliation, and manual paths all use the one settlement service", () => {
  for (const path of [
    "app/api/deliveries/verify/route.ts",
    "app/api/marketplace/verify/route.ts",
    "app/api/wallet/verify/route.ts",
    "app/api/payments/squad/webhook/route.ts",
    "lib/payments/reconciliation.ts",
    "app/api/admin/payments/reconcile/route.ts"
  ]) {
    assert.match(read(path), /settleSquadPayment/);
  }
  for (const path of ["app/api/deliveries/verify/route.ts", "app/api/marketplace/verify/route.ts", "app/api/wallet/verify/route.ts"]) {
    assert.doesNotMatch(read(path), /complete_wallet_funding|creditBusinessOrderWallet|recordDeliveryIncome|verifySquadTransaction/);
  }
});

test("F-007 routes the account-wide Squad redirect to the owner's specific payment callback", () => {
  const paymentReturn = read("app/api/payments/return/route.ts");
  const paymentReturnPage = read("app/payment/callback/page.tsx");
  assert.match(paymentReturn, /supabase\.auth\.getUser\(\)/);
  assert.match(paymentReturn, /intent\.owner_user_id !== user\.id/);
  assert.match(paymentReturn, /\/wallet\/callback\?reference=/);
  assert.match(paymentReturn, /\/delivery\/callback\?/);
  assert.match(paymentReturn, /\/marketplace\/callback\?reference=/);
  assert.match(paymentReturnPage, /\/api\/payments\/return\?reference=/);
  assert.match(paymentReturnPage, /window\.location\.replace\(result\.destination\)/);
});

test("F-007 gives an authenticated customer a safe pending-delivery recovery path", () => {
  const tracking = read("components/tracking/live-order-tracking.tsx");
  const verify = read("app/api/deliveries/verify/route.ts");
  assert.match(tracking, /function PaymentRecoveryCard/);
  assert.match(tracking, /\/api\/deliveries\/verify\?\$\{params\.toString\(\)\}/);
  assert.match(tracking, /This check never creates another payment/);
  assert.match(tracking, /order\.status !== "pending_payment"/);
  assert.match(verify, /query = query\.eq\("customer_id", user\.id\)/);
  assert.match(verify, /String\(\(delivery\.metadata \|\| \{\}\)\.provider_reference \|\| ""\) !== reference/);
});

test("F-007 gives a pending wallet top-up a safe customer recovery action", () => {
  const history = read("components/wallet/transaction-history.tsx");
  const topUp = read("app/api/wallet/topup/route.ts");
  assert.match(history, /function verifyPendingTopUp/);
  assert.match(history, /\/api\/wallet\/verify\?reference=/);
  assert.match(history, /This payment verification never creates another payment|No new charge will be created/);
  assert.match(history, /transaction\.transaction_type === "wallet_funding"/);
  assert.match(history, /transaction\.status === "pending"/);
  assert.ok(topUp.indexOf("await markPaymentIntentPending(paymentDb, paymentIntent.id)") < topUp.indexOf("authorizationUrl: squadCheckout.authorizationUrl"));
});

test("F-007 preserves server-created intents before Squad redirects and minimizes provider metadata", () => {
  for (const path of ["app/api/deliveries/checkout/route.ts", "app/api/marketplace/checkout/route.ts", "app/api/wallet/topup/route.ts"]) {
    const source = read(path);
    assert.match(source, /createPaymentIntent/);
    assert.match(source, /markPaymentIntentPending/);
    assert.ok(source.indexOf("createPaymentIntent") < source.indexOf("initiateSquadPayment"));
    const providerRequest = source.slice(source.indexOf("initiateSquadPayment({"));
    assert.doesNotMatch(providerRequest, /squad_raw|pickup_address: pickup|delivery_address: address/);
  }
});

test("F-007 reconciliation is cron-protected, bounded, and manual reconciliation requires verified admin authority", () => {
  const cron = read("app/api/payments/reconcile/route.ts");
  const manual = read("app/api/admin/payments/reconcile/route.ts");
  const reconciliation = read("lib/payments/reconciliation.ts");
  assert.match(cron, /authorizeCronRequest/);
  assert.match(manual, /requireAdminSession/);
  assert.match(manual, /paymentManualReconcile/);
  assert.match(reconciliation, /Math\.min\(50/);
  assert.match(reconciliation, /mapSafeLegacyPaymentIntents/);
  assert.match(read("vercel.json"), /api\/payments\/reconcile/);
});

test("F-007 leaves daily commission and job acceptance rules outside the payment migration", () => {
  const migration = read("supabase-payment-webhook-reconciliation-delta.sql");
  assert.doesNotMatch(migration, /daily_commission|commission_rate|accept_delivery_offer|assign_next_delivery_to_rider/i);
  assert.match(read("vercel.json"), /api\/wallet\/daily-commission/);
});

test("F-007 does not return Squad access tokens or preserve raw provider payloads in repaired records", () => {
  for (const path of ["app/api/deliveries/checkout/route.ts", "app/api/marketplace/checkout/route.ts", "app/api/wallet/topup/route.ts"]) {
    assert.doesNotMatch(read(path), /accessCode/);
  }
  const repair = read("lib/marketplace-order-repair.ts");
  assert.match(repair, /delete safeMetadata\.squad_raw/);
  assert.doesNotMatch(repair, /squad_raw:\s*/);
});

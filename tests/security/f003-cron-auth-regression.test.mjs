import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import {
  MIN_CRON_SECRET_LENGTH,
  authorizeCronRequest
} from "../../lib/cron-auth.ts";
import { businessCommissionRate } from "../../lib/business-commission.ts";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const validSecret = "cron-secret-with-at-least-32-characters";

test("F-003 cron configuration fails closed for missing, empty, whitespace-only, and short secrets", () => {
  for (const secret of [undefined, "", "   ", "too-short"]) {
    const result = authorizeCronRequest(
      new Request("https://fastfleet.com.ng/api/wallet/daily-commission", {
        headers: { authorization: `Bearer ${validSecret}` }
      }),
      { CRON_SECRET: secret }
    );
    assert.deepEqual(result, { authorized: false, reason: "misconfigured" });
  }

  assert.equal(MIN_CRON_SECRET_LENGTH, 32);
});

test("F-003 rejects missing, malformed, and incorrect Authorization headers", () => {
  for (const authorization of [
    undefined,
    "Basic credentials",
    validSecret,
    "Bearer",
    `Bearer  ${validSecret}`,
    `Bearer ${validSecret} extra`,
    "Bearer incorrect-secret-with-at-least-32-characters"
  ]) {
    const headers = authorization ? { authorization } : undefined;
    const result = authorizeCronRequest(
      new Request("https://fastfleet.com.ng/api/wallet/daily-commission", { headers }),
      { CRON_SECRET: validSecret }
    );
    assert.deepEqual(result, { authorized: false, reason: "unauthorized" });
  }
});

test("F-003 accepts only the correctly configured Bearer token", () => {
  const result = authorizeCronRequest(
    new Request("https://fastfleet.com.ng/api/wallet/daily-commission", {
      headers: { authorization: `Bearer ${validSecret}` }
    }),
    { CRON_SECRET: validSecret }
  );

  assert.deepEqual(result, { authorized: true });
});

test("F-003 route returns generic errors for misconfiguration and unauthorized requests", async () => {
  const state = createCommissionState([]);
  const misconfiguredRoute = loadRouteModule(state, {
    authorizeCronRequest: () => ({ authorized: false, reason: "misconfigured" })
  });
  const unauthorizedRoute = loadRouteModule(state, {
    authorizeCronRequest: () => ({ authorized: false, reason: "unauthorized" })
  });

  const misconfiguredResponse = await misconfiguredRoute.GET(
    new Request("https://fastfleet.com.ng/api/wallet/daily-commission")
  );
  const unauthorizedResponse = await unauthorizedRoute.GET(
    new Request("https://fastfleet.com.ng/api/wallet/daily-commission", {
      headers: { authorization: "Bearer submitted-secret-that-must-not-be-returned" }
    })
  );
  const serialized = JSON.stringify({ misconfiguredResponse, unauthorizedResponse });

  assert.equal(misconfiguredResponse.status, 503);
  assert.equal(misconfiguredResponse.body.error, "Commission job is not securely configured.");
  assert.equal(unauthorizedResponse.status, 401);
  assert.equal(unauthorizedResponse.body.error, "Commission job authorization required.");
  assert.doesNotMatch(serialized, /submitted-secret-that-must-not-be-returned/);
});

test("F-003 keeps authenticated GET for Vercel Cron and removes POST execution", () => {
  const route = read("app/api/wallet/daily-commission/route.ts");
  const vercel = JSON.parse(read("vercel.json"));

  assert.match(route, /export async function GET\(request: Request\)/);
  assert.doesNotMatch(route, /export async function POST\(/);
  assert.ok(vercel.crons.some((cron) => cron.path === "/api/wallet/daily-commission" && cron.schedule === "59 22 * * *"));
  assert.ok(vercel.crons.some((cron) => cron.path === "/api/payments/reconcile"));
});

test("F-003 business commission policy keeps Pharmacy at 5% and every other category at 10%", () => {
  for (const businessType of ["Restaurant", "Mall", "Grocery", "Fashion", "Electronics", "Gadgets", "Unknown"]) {
    assert.equal(businessCommissionRate(businessType), 10);
  }
  assert.equal(businessCommissionRate("Pharmacy"), 5);
  assert.equal(businessCommissionRate("pharmacy"), 5);
  assert.equal(businessCommissionRate("Med / Pharmacy"), 5);

  const route = read("app/api/wallet/daily-commission/route.ts");
  assert.match(route, /businessCommissionRate\(business\.business_type \|\| business\.industry\)/);
  assert.match(route, /update\(\{ commission_rate: rate \}\)/);
});

test("F-003 repeated authorized commission processing does not duplicate deductions or notifications", async () => {
  const state = createCommissionState([
    {
      amount_ngn: 1_000,
      transaction_type: "rider_earning",
      provider: "delivery_settlement",
      metadata: { account_kind: "rider" }
    }
  ]);
  const route = loadRouteModule(state);
  const input = commissionInput({ rate: 10 });

  const first = await route.deductCommission(state.db, input);
  const second = await route.deductCommission(state.db, input);

  assert.equal(first.status, "deducted");
  assert.equal(first.amount, 100);
  assert.equal(second.status, "skipped");
  assert.equal(second.reason, "Already deducted for date");
  assert.equal(state.commissionTransactions.length, 1);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.walletUpdates.length, 1);
});

test("F-003 zero-earning accounts stay skipped and commission calculation stays unchanged", async () => {
  const zeroState = createCommissionState([]);
  const zeroRoute = loadRouteModule(zeroState);
  const zeroResult = await zeroRoute.deductCommission(zeroState.db, commissionInput({ rate: 10 }));

  assert.equal(zeroResult.status, "skipped");
  assert.equal(zeroResult.reason, "No new earnings for date");
  assert.equal(zeroState.commissionTransactions.length, 0);
  assert.equal(zeroState.notifications.length, 0);

  const earningState = createCommissionState([
    {
      amount_ngn: 1_055,
      transaction_type: "rider_earning",
      provider: "delivery_settlement",
      metadata: { account_kind: "rider" }
    }
  ]);
  const earningRoute = loadRouteModule(earningState);
  const earningResult = await earningRoute.deductCommission(earningState.db, commissionInput({ rate: 10 }));

  assert.equal(earningResult.earnings, 1_055);
  assert.equal(earningResult.amount, 106);
  assert.equal(earningState.commissionTransactions[0].amount_ngn, -106);
});

test("F-003 never exposes authorization values in logs or responses", async () => {
  const state = createCommissionState([]);
  const logs = [];
  const route = loadRouteModule(state, {
    authorizeCronRequest: () => ({ authorized: true }),
    console: {
      info: (...values) => logs.push(values),
      error: (...values) => logs.push(values)
    }
  });
  const response = await route.GET(
    new Request("https://fastfleet.com.ng/api/wallet/daily-commission", {
      headers: { authorization: `Bearer ${validSecret}` }
    })
  );
  const serialized = JSON.stringify({ logs, response });

  assert.equal(response.status, 200);
  assert.doesNotMatch(serialized, new RegExp(validSecret));
  assert.doesNotMatch(serialized, /authorization/i);
  assert.match(serialized, /authorized_execution/);
  assert.match(serialized, /successCount/);
  assert.match(serialized, /skippedCount/);
  assert.match(serialized, /failureCount/);
});

function commissionInput(overrides = {}) {
  return {
    accountKind: "rider",
    accountId: "rider-1",
    userId: "user-1",
    walletType: "rider",
    rate: 10,
    runDate: "2026-07-16",
    reference: "commission:rider:rider-1:2026-07-16",
    metadata: {
      account_kind: "rider",
      rider_profile_id: "rider-1",
      commission_rate: 10,
      run_date: "2026-07-16"
    },
    ...overrides
  };
}

function createCommissionState(earnings) {
  const state = {
    earnings,
    commissionTransactions: [],
    notifications: [],
    walletUpdates: [],
    wallet: { id: "wallet-1", balance_ngn: 5_000 }
  };

  state.db = {
    from(table) {
      return new FakeQuery(table, state);
    }
  };
  return state;
}

class FakeQuery {
  constructor(table, state) {
    this.table = table;
    this.state = state;
    this.filters = new Map();
  }

  select() {
    return this;
  }

  eq(column, value) {
    this.filters.set(column, value);
    return this;
  }

  gte() {
    return this;
  }

  lt() {
    return this;
  }

  limit() {
    return this;
  }

  async maybeSingle() {
    const reference = this.filters.get("provider_reference");
    const existing = this.state.commissionTransactions.find(
      (transaction) => transaction.provider_reference === reference
    );
    return { data: existing ? { id: existing.id } : null, error: null };
  }

  async insert(payload) {
    if (this.table === "transactions") {
      if (this.state.commissionTransactions.some((transaction) => transaction.provider_reference === payload.provider_reference)) {
        return { error: { code: "23505", message: "duplicate provider reference" } };
      }
      this.state.commissionTransactions.push({
        id: `transaction-${this.state.commissionTransactions.length + 1}`,
        ...payload
      });
    }
    if (this.table === "notifications") this.state.notifications.push(payload);
    return { error: null };
  }

  update(payload) {
    return {
      eq: async () => {
        this.state.walletUpdates.push(payload);
        this.state.wallet = { ...this.state.wallet, ...payload };
        return { error: null };
      }
    };
  }

  then(resolve, reject) {
    let result;
    if (this.table === "transactions") result = { data: this.state.earnings, error: null };
    else if (this.table === "business_profiles" || this.table === "rider_profiles") result = { data: [], error: null };
    else result = { data: [], error: null };
    return Promise.resolve(result).then(resolve, reject);
  }
}

function loadRouteModule(state, options = {}) {
  const source = `${read("app/api/wallet/daily-commission/route.ts")}
export { deductCommission, newEarningsForDate };
`;
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const loadedModule = { exports: {} };
  const sandbox = {
    exports: loadedModule.exports,
    module: loadedModule,
    Request,
    console: options.console || console,
    process: { env: {} },
    require(specifier) {
      if (specifier === "crypto") return crypto;
      if (specifier === "next/server") {
        return {
          NextResponse: {
            json(body, init = {}) {
              return { body, status: init.status || 200 };
            }
          }
        };
      }
      if (specifier === "@/lib/cron-auth") {
        return {
          authorizeCronRequest:
            options.authorizeCronRequest || (() => ({ authorized: true }))
        };
      }
      if (specifier === "@/lib/supabase/admin") {
        return { createAdminClient: () => state.db };
      }
      if (specifier === "@/lib/wallet-ledger") {
        return {
          ensureWallet: async () => state.wallet,
          riderCommissionRate: () => 10
        };
      }
      if (specifier === "@/lib/business-commission") {
        return { businessCommissionRate };
      }
      if (specifier === "@/lib/rate-limit") {
        return {
          enforceRateLimit: options.enforceRateLimit || (async () => null),
          rateLimitPolicies: { cronDailyCommission: {} }
        };
      }
      throw new Error(`Unexpected import: ${specifier}`);
    }
  };

  vm.runInNewContext(output, sandbox, {
    filename: "app/api/wallet/daily-commission/route.ts"
  });
  return loadedModule.exports;
}

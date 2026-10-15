import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardPage = readFileSync("app/dashboard/page.tsx", "utf8");
const dashboardApi = readFileSync("app/api/customer/dashboard/route.ts", "utf8");
const menus = readFileSync("lib/dashboard-menus.ts", "utf8");

test("F064: self-service roles can open their own customer order history", () => {
  assert.match(dashboardPage, /if \(role === "admin"\) redirect\(roleHome\.admin\);/);
  assert.doesNotMatch(dashboardPage, /role !== "customer"/);
  assert.match(dashboardApi, /\.eq\("customer_id", userId\)/);
  assert.match(menus, /My customer orders/);
  assert.match(menus, /href: "\/dashboard#orders"/);
});

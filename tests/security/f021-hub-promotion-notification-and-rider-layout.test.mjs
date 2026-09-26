import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const promotionRoute = read("app/api/admin/hub-promotion-slides/route.ts");
const promotionEditor = read("components/admin/hub-promotion-slides-section.tsx");
const adminPanel = read("components/admin/admin-panel.tsx");
const riderDashboard = read("components/rider/rider-dashboard.tsx");

test("F-021 notifies users about the selected Hub promotion, not the first enabled one", () => {
  assert.match(promotionRoute, /const promotionId = typeof body\.promotionId === "string"/);
  assert.match(promotionRoute, /\.find\(\(slide\) => slide\.id === promotionId\)/);
  assert.doesNotMatch(promotionRoute, /const \[promotion\] = enabledHubPromotionSlides/);
  assert.match(promotionEditor, /promotionId: slide\.id/);
  assert.doesNotMatch(promotionEditor, /onSave\(\{ notifyUsers: true \}\)/);
  assert.match(adminPanel, /promotionId: options\.promotionId/);
});

test("F-021 places the rider online control immediately after the wallet card", () => {
  const homeTab = riderDashboard.slice(riderDashboard.indexOf("function HomeTab"));
  const walletIndex = homeTab.indexOf("<WalletDashboardCard");
  const onlineCardIndex = homeTab.indexOf("<Card className=\"p-5\">");
  const transactionsIndex = homeTab.indexOf("<TransactionHistory accountKind=\"rider\" />");
  assert.ok(walletIndex >= 0 && onlineCardIndex > walletIndex && transactionsIndex > onlineCardIndex);
});

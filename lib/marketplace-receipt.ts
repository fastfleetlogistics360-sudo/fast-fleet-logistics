import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export type MarketplaceReceipt = {
  receiptCode: string;
  createdAt: string | null;
  deliveredAt: string | null;
  marketplaceKind?: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  items: Array<{ name: string; quantity: number; amountNgn?: number | null }>;
  goodsAmountNgn: number;
  deliveryFeeNgn: number;
  platformFeeNgn: number;
  totalPaidNgn: number;
};

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const NIGHT = rgb(0.03, 0.11, 0.21);
const EMBER = rgb(0.96, 0.37, 0.08);
const MUTED = rgb(0.35, 0.4, 0.47);
const LINE = rgb(0.88, 0.9, 0.92);

export async function createMarketplaceReceiptPdf(receipt: MarketplaceReceipt) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Fast Fleets 360 receipt ${receipt.receiptCode}`);
  pdf.setAuthor("Fast Fleets 360");
  pdf.setSubject("Marketplace delivery receipt");

  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = PAGE.height - PAGE.margin;

  page.drawText("FAST FLEETS 360", { x: PAGE.margin, y, size: 18, font: bold, color: NIGHT });
  page.drawText("MARKETPLACE RECEIPT", { x: PAGE.margin, y: y - 18, size: 8, font: bold, color: EMBER });
  page.drawText(receipt.receiptCode, { x: PAGE.width - PAGE.margin - textWidth(bold, receipt.receiptCode, 10), y: y - 2, size: 10, font: bold, color: NIGHT });
  y -= 58;

  y = drawRule(page, y);
  y = drawDetail(page, regular, bold, "Order placed", dateLabel(receipt.createdAt), y);
  y = drawDetail(page, regular, bold, "Delivered", dateLabel(receipt.deliveredAt), y);
  y = drawDetail(page, regular, bold, "Order type", receipt.marketplaceKind === "shopping" ? "Shopping marketplace" : "Restaurant marketplace", y);
  y -= 8;

  page.drawText("ORDER ITEMS", { x: PAGE.margin, y, size: 9, font: bold, color: NIGHT });
  y -= 20;
  for (const item of receipt.items.length ? receipt.items : [{ name: "Marketplace order", quantity: 1 }]) {
    const label = `${Math.max(1, item.quantity)} x ${item.name}`;
    y = drawWrapped(page, regular, label, PAGE.margin, y, PAGE.width - PAGE.margin * 2 - 95, 10, NIGHT, 15);
    if (Number(item.amountNgn) > 0) {
      const amount = formatMoney(Number(item.amountNgn));
      page.drawText(amount, { x: PAGE.width - PAGE.margin - textWidth(bold, amount, 10), y: y + 15, size: 10, font: bold, color: NIGHT });
    }
    y -= 6;
  }
  y -= 6;
  y = drawRule(page, y);

  const totals: Array<[string, number]> = [
    ["Items", receipt.goodsAmountNgn],
    ["Delivery fee", receipt.deliveryFeeNgn],
    ["Platform fee", receipt.platformFeeNgn]
  ];
  for (const [label, amount] of totals) {
    page.drawText(label, { x: PAGE.margin, y, size: 10, font: regular, color: MUTED });
    const value = formatMoney(Number(amount));
    page.drawText(value, { x: PAGE.width - PAGE.margin - textWidth(bold, value, 10), y, size: 10, font: bold, color: NIGHT });
    y -= 19;
  }
  page.drawRectangle({ x: PAGE.margin, y: y - 13, width: PAGE.width - PAGE.margin * 2, height: 42, color: rgb(0.96, 0.97, 0.98) });
  page.drawText("TOTAL PAID", { x: PAGE.margin + 12, y: y + 2, size: 10, font: bold, color: NIGHT });
  const total = formatMoney(receipt.totalPaidNgn);
  page.drawText(total, { x: PAGE.width - PAGE.margin - 12 - textWidth(bold, total, 13), y, size: 13, font: bold, color: NIGHT });
  y -= 42;

  y = drawRule(page, y);
  page.drawText("DELIVERY ROUTE", { x: PAGE.margin, y, size: 9, font: bold, color: NIGHT });
  y -= 18;
  y = drawAddress(page, regular, bold, "Pickup", receipt.pickupAddress, y);
  y = drawAddress(page, regular, bold, "Drop-off", receipt.dropoffAddress, y);

  page.drawText("Thank you for choosing Fast Fleets 360.", { x: PAGE.margin, y: 54, size: 9, font: regular, color: MUTED });
  page.drawText("This receipt confirms your completed marketplace delivery.", { x: PAGE.margin, y: 40, size: 8, font: regular, color: MUTED });
  return Buffer.from(await pdf.save());
}

function drawDetail(page: ReturnType<PDFDocument["addPage"]>, regular: PDFFont, bold: PDFFont, label: string, value: string, y: number) {
  page.drawText(label, { x: PAGE.margin, y, size: 9, font: regular, color: MUTED });
  page.drawText(value, { x: PAGE.margin + 116, y, size: 9, font: bold, color: NIGHT });
  return y - 17;
}

function drawAddress(page: ReturnType<PDFDocument["addPage"]>, regular: PDFFont, bold: PDFFont, label: string, address: string, y: number) {
  page.drawText(label.toUpperCase(), { x: PAGE.margin, y, size: 8, font: bold, color: EMBER });
  return drawWrapped(page, regular, address || "Not provided", PAGE.margin, y - 14, PAGE.width - PAGE.margin * 2, 9, NIGHT, 14) - 8;
}

function drawRule(page: ReturnType<PDFDocument["addPage"]>, y: number) {
  page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.width - PAGE.margin, y }, thickness: 1, color: LINE });
  return y - 18;
}

function drawWrapped(page: ReturnType<PDFDocument["addPage"]>, font: PDFFont, value: string, x: number, y: number, maxWidth: number, size: number, color: ReturnType<typeof rgb>, leading: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  for (const item of lines) {
    page.drawText(item, { x, y, size, font, color });
    y -= leading;
  }
  return y;
}

function textWidth(font: PDFFont, value: string, size: number) {
  return font.widthOfTextAtSize(value, size);
}

function formatMoney(value: number) {
  return `NGN ${Math.max(0, Math.round(value || 0)).toLocaleString("en-NG")}`;
}

function dateLabel(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "Not available";
}

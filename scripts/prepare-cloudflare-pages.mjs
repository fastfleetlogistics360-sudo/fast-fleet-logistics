import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const output = join(root, "cloudflare-pages");

const entries = [
  "index.html",
  "mainpage.html",
  "auth.html",
  "order.html",
  "track.html",
  "dashboard.html",
  "driver.html",
  "services.html",
  "support.html",
  "register-driver.html",
  "register-business.html",
  "privacy.html",
  "terms.html",
  "cookies.html",
  "ndpr.html",
  "robots.txt",
  "sitemap.xml",
  "_redirects",
  "admin",
  "assets",
  "css",
  "js"
];

function countFiles(path) {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (stat.isFile()) return 1;
  return readdirSync(path).reduce((total, entry) => total + countFiles(join(path, entry)), 0);
}

rmSync(output, { force: true, recursive: true });
mkdirSync(output, { recursive: true });

for (const entry of entries) {
  const source = join(root, entry);
  if (!existsSync(source)) continue;
  cpSync(source, join(output, entry), { recursive: true });
}

const fileCount = countFiles(output);
console.log(`Prepared ${output}`);
console.log(`Files: ${fileCount}/1000`);

if (fileCount > 1000) {
  throw new Error("Cloudflare Pages direct upload folder is over the 1,000-file limit.");
}

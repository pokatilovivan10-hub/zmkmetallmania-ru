import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const source = new URL("https://zmk-metallmania.ru/");
const targetOrigin = "https://zmkmetallmania.ru";
const root = process.cwd();
const routes = [
  "/", "/services", "/market", "/bpla-protection", "/projects", "/calculator",
  "/school", "/blog", "/contacts", "/privacy", "/directions/advertising-structures",
  "/directions/antennas-masts", "/directions/car-service-buildings", "/directions/hangars",
  "/directions/padel-courts", "/directions/retail-islands", "/projects/izumrudnaya-antennas",
  "/projects/krasnogorsk-start-billboard", "/projects/shchelkovo-car-wash",
  "/projects/vidnoye-hangar-48x24"
];
const pending = new Set(routes.map((route) => new URL(route, source).href));
const completed = new Set();

function destination(url) {
  const pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) return path.join(root, pathname, "index.html");
  if (!path.extname(pathname)) return path.join(root, pathname, "index.html");
  return path.join(root, pathname);
}

function discover(text, base, contentType) {
  const urls = [];
  const expressions = contentType.includes("text/css")
    ? [/url\((?:["']?)([^"')]+)(?:["']?)\)/g]
    : [/(?:src|href|srcset)=["']([^"']+)["']/g, /(?:from|import)\s*\(?["']([^"']+)["']/g, /["'](\/_next\/static\/[^"']+|\/optimized\/[^"']+|\/videos\/[^"']+)["']/g];
  for (const expression of expressions) for (const match of text.matchAll(expression)) {
    for (const rawValue of match[1].split(",").map((part) => part.trim().split(/\s+/)[0])) {
      const raw = rawValue.replaceAll("\\\\", "");
      if (!raw || raw.includes("${") || raw.startsWith("data:") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("#")) continue;
      try {
        const url = new URL(raw, base);
        if (/\.[a-z0-9]+\/$/i.test(url.pathname)) url.pathname = url.pathname.slice(0, -1);
        if (url.origin === source.origin) urls.push(url.href);
      } catch {}
    }
  }
  return urls;
}

while (pending.size) {
  const href = pending.values().next().value;
  pending.delete(href);
  if (completed.has(href)) continue;
  completed.add(href);
  const url = new URL(href);
  const response = await fetch(url, { headers: { "accept-encoding": "identity" } });
  if (!response.ok) {
    console.warn(`Skipped ${response.status} ${url}`);
    continue;
  }
  const contentType = response.headers.get("content-type") ?? "";
  let body = Buffer.from(await response.arrayBuffer());
  if (contentType.includes("text/html") || contentType.includes("text/css") || contentType.includes("javascript")) {
    let text = body.toString("utf8");
    for (const discovered of discover(text, url, contentType)) if (!completed.has(discovered)) pending.add(discovered);
    if (contentType.includes("text/html")) text = text.split(source.origin).join(targetOrigin);
    body = Buffer.from(text);
  }
  const output = destination(url);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, body);
}

console.log(`Mirrored ${completed.size} same-origin resources.`);

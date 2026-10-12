// Builds data.json: solana-only daily revenue of trading terminals and bots,
// from the free DefiLlama api. Runs once a day in GitHub Actions.
import { readFile, writeFile } from "node:fs/promises";
import { renderCard } from "./card.mjs";

const API = "https://api.llama.fi";
const CATEGORIES = new Set(["Trading App", "Telegram Bot"]);
const DAY = 86400;

async function getJson(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) return await res.json();
      console.warn(`${res.status} for ${url}`);
    } catch (err) {
      console.warn(`attempt ${attempt} failed for ${url}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  return null;
}

// value for solana in one breakdown entry, whatever shape it has
function solanaValue(entry) {
  if (!entry || typeof entry !== "object") return 0;
  const key = Object.keys(entry).find((k) => k.toLowerCase() === "solana");
  if (!key) return 0;
  const v = entry[key];
  if (typeof v === "number") return v;
  if (v && typeof v === "object") return Object.values(v).reduce((s, x) => s + (Number(x) || 0), 0);
  return 0;
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

async function main() {
  const overview = await getJson(
    `${API}/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyRevenue`
  );
  if (!overview?.protocols) throw new Error("no overview from defillama");

  const candidates = overview.protocols.filter(
    (p) => CATEGORIES.has(p.category) && (p.chains ?? []).some((c) => c.toLowerCase() === "solana")
  );
  console.log(`candidates: ${candidates.map((p) => p.name).join(", ")}`);

  // official x handles, as listed by defillama (not guessed)
  const protocols = (await getJson(`${API}/protocols`)) ?? [];
  const handleByName = new Map();
  for (const pr of protocols) {
    if (pr?.twitter) {
      handleByName.set(String(pr.name).toLowerCase(), pr.twitter);
      if (pr.slug) handleByName.set(String(pr.slug).toLowerCase(), pr.twitter);
    }
  }
  const handleFor = (p) =>
    handleByName.get(String(p.slug ?? "").toLowerCase()) ??
    handleByName.get(String(p.name ?? "").toLowerCase()) ??
    (p.parentProtocol ? handleByName.get(String(p.parentProtocol).replace(/^parent#/, "").toLowerCase()) : undefined) ??
    null;

  const today = Math.floor(Date.now() / 1000 / DAY) * DAY;
  const terminals = [];

  for (const p of candidates) {
    const slug = p.slug ?? p.module;
    const data = await getJson(
      `${API}/summary/fees/${slug}?dataType=dailyRevenue&excludeTotalDataChart=true`
    );
    const breakdown = data?.totalDataChartBreakdown;
    if (!Array.isArray(breakdown) || breakdown.length === 0) continue;

    // daily solana values, oldest first, last 60 days
    const days = breakdown
      .map(([ts, entry]) => ({ t: Number(ts), v: Math.max(0, solanaValue(entry)) }))
      .filter((d) => d.t >= today - 60 * DAY && d.t < today) // only finished days
      .sort((a, b) => a.t - b.t);
    if (days.length === 0) continue;

    const last = days[days.length - 1];
    const stale = today - last.t > 3 * DAY; // stopped reporting (e.g. padre)
    const v = days.map((d) => d.v);
    const d1 = v.at(-1) ?? 0;
    const d1prev = v.at(-2) ?? 0;
    const d7 = sum(v.slice(-7));
    const d7prev = sum(v.slice(-14, -7));
    const d30 = sum(v.slice(-30));
    const d30prev = sum(v.slice(-60, -30));
    if (d30 < 1000 && !stale) continue; // ignore dust

    terminals.push({
      name: p.displayName ?? p.name,
      slug,
      category: p.category,
      logo: p.logo ?? null,
      twitter: handleFor(p),
      stale,
      lastDay: new Date(last.t * 1000).toISOString().slice(0, 10),
      d1, d1prev, d7, d7prev, d30, d30prev,
      spark: v.slice(-30),
    });
    console.log(`${p.name}: 24h ${Math.round(d1)} · 30d ${Math.round(d30)}${stale ? " (stale)" : ""}`);
  }

  if (terminals.length === 0) throw new Error("no terminals found, keeping old data");

  // rank change: position by yesterday vs the day before
  const live = terminals.filter((t) => !t.stale);
  const rank = (key) => [...live].sort((a, b) => b[key] - a[key]).map((t) => t.slug);
  const now = rank("d1");
  const before = rank("d1prev");
  for (const t of live) t.rankChange = before.indexOf(t.slug) - now.indexOf(t.slug);

  const out = {
    updatedAt: new Date().toISOString(),
    source: "defillama, daily revenue, solana chain only",
    terminals: terminals.sort((a, b) => b.d1 - a.d1),
  };
  await writeFile(new URL("../public/data.json", import.meta.url), JSON.stringify(out, null, 1));
  console.log(`wrote ${terminals.length} terminals`);

  // share image for link previews on x, plus a cache-busting version in the page meta
  try {
    const png = await renderCard(out);
    await writeFile(new URL("../public/og.png", import.meta.url), png);
    const day = out.terminals.find((t) => !t.stale)?.lastDay ?? "";
    const htmlUrl = new URL("../public/index.html", import.meta.url);
    const html = await readFile(htmlUrl, "utf8");
    await writeFile(htmlUrl, html.replace(/og\.png\?v=[^"]*/g, `og.png?v=${day}`));
    console.log("wrote og.png");
  } catch (err) {
    console.warn("share image failed, data is still updated:", err.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

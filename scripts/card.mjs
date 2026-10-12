// Renders the daily standings as a 1200x630 png for link previews on x.
// The svg is also exported so it can be previewed without resvg.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const usd = (n) =>
  n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "m" : n >= 1e3 ? "$" + (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "k" : "$" + Math.round(n);

export function cardSvg(data) {
  const list = data.terminals.filter((t) => !t.stale && t.d1 > 0).sort((a, b) => b.d1 - a.d1).slice(0, 5);
  const day = list[0]?.lastDay ?? "";
  const max = list[0]?.d1 || 1;
  const medal = ["#ffc857", "#d6dbe8", "#d79a63", "#9aa0b8", "#9aa0b8"];

  const rows = list
    .map((t, i) => {
      const y = 210 + i * 76;
      const w = Math.max(6, 520 * (t.d1 / max));
      const ch = t.rankChange ?? 0;
      const arrow = ch > 0 ? `<text x="1150" y="${y + 33}" font-size="22" font-weight="800" fill="#14f195" text-anchor="end">▲${ch}</text>`
        : ch < 0 ? `<text x="1150" y="${y + 33}" font-size="22" font-weight="800" fill="#ff5c7a" text-anchor="end">▼${-ch}</text>` : "";
      return `
      <text x="64" y="${y + 36}" font-size="36" font-weight="900" fill="${medal[i]}">${i + 1}</text>
      <text x="112" y="${y + 36}" font-size="34" font-weight="800" fill="#f2f2f5">${esc(t.name)}</text>
      <rect x="410" y="${y + 12}" width="520" height="30" rx="8" fill="#1a2140"/>
      <rect x="410" y="${y + 12}" width="${w}" height="30" rx="8" fill="url(#bar)"/>
      <text x="1095" y="${y + 37}" font-size="32" font-weight="900" fill="#f2f2f5" text-anchor="end">${usd(t.d1)}</text>
      ${arrow}`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Inter, DejaVu Sans, Arial, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a0d1a"/><stop offset="1" stop-color="#2a1030"/></linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9945ff"/><stop offset="1" stop-color="#14f195"/></linearGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff5c7a"/><stop offset=".5" stop-color="#ffc857"/><stop offset="1" stop-color="#14f195"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="64" y="104" font-size="72" font-weight="900" fill="#f2f2f5" letter-spacing="-2">terminal <tspan fill="url(#title)">wars</tspan></text>
  <text x="64" y="152" font-size="26" font-weight="600" fill="#9aa0b8">solana revenue · ${esc(day)} · solana chain only</text>
  ${rows}
  <text x="64" y="598" font-size="26" font-weight="800" fill="#14f195">wars.owlchainlabs.xyz</text>
  <text x="1136" y="598" font-size="22" font-weight="600" fill="#9aa0b8" text-anchor="end">data: defillama · @OwlChainLabs</text>
</svg>`;
}

export async function renderCard(data) {
  // imported lazily so data updates still work if the renderer is missing
  const { Resvg } = await import("@resvg/resvg-js");
  return new Resvg(cardSvg(data), { fitTo: { mode: "width", value: 1200 }, font: { loadSystemFonts: true } }).render().asPng();
}

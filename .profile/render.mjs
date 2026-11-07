import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const W = 840;
const METRICS = JSON.parse(readFileSync(".profile/metrics.json", "utf8"));
const FONT = readFileSync(".profile/font.b64", "utf8").trim();

// --- Text & SVG Utilities ---
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function textWidth(s, size, weight = 400) {
  const key = [400, 500, 600, 700].reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  const table = METRICS[String(key)];
  let w = 0;
  for (const c of String(s)) w += table[c] ?? 0.56;
  return w * size;
}

function wrap(s, size, width, weight = 400, lines = 2) {
  const out = [];
  let cur = "";
  for (const word of String(s).split(/\s+/).filter(Boolean)) {
    const trial = cur ? `${cur} ${word}` : word;
    if (textWidth(trial, size, weight) <= width || !cur) cur = trial;
    else {
      out.push(cur);
      cur = word;
    }
  }
  out.push(cur);
  if (out.length > lines) {
    out.length = lines;
    let last = out[lines - 1];
    while (textWidth(last + "…", size, weight) > width && last.includes(" ")) {
      last = last.slice(0, last.lastIndexOf(" "));
    }
    out[lines - 1] = last + "…";
  }
  return out;
}

function fit(s, size, width, weight = 400) {
  if (textWidth(s, size, weight) <= width) return s;
  let t = String(s);
  while (t.length > 1 && textWidth(t + "…", size, weight) > width) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}

function txt(x, y, s, size, fill, o = {}) {
  let style = `font-size:${size}px;font-weight:${o.weight ?? 400};`;
  if (o.mono) style += `font-family:'JetBrains Mono','Fira Code',monospace;`;
  if (o.delay !== undefined) style += `animation-delay:${o.delay.toFixed(2)}s;`;
  const c = o.cls ? ` class="${o.cls}"` : "";
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" text-anchor="${o.anchor ?? "start"}" style="${style}"${c}${o.extra ?? ""}>${esc(s)}</text>`;
}

function pop(body, delay = 0, cls = "pop") {
  return `<g class="${cls}" style="animation-delay:${delay.toFixed(2)}s">${body}</g>`;
}

function icon(icons, name, x, y, size, fill) {
  if (!name) return "";
  if (name.startsWith("brand:")) {
    const b = icons.brand[name.slice(6)];
    if (!b) return "";
    return `<path d="${b.d}" fill="${fill}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(size / 24).toFixed(4)})"/>`;
  }
  const d = icons.symbol[name + "#fill"] || icons.symbol[name];
  if (!d) return "";
  const s = size / 960;
  return `<path d="${d}" fill="${fill}" transform="translate(${x.toFixed(1)} ${(y + 960 * s).toFixed(1)}) scale(${s.toFixed(4)})"/>`;
}

// --- Glassmorphism + Neo-Brutalism Theme System (German Flag Accents: Black, Red, Gold) ---
function getTheme(dark) {
  if (dark) {
    return {
      dark: true,
      canvasBg: "#0B0B0E",
      gridStroke: "rgba(255,255,255,0.045)",
      cardShadow: "#000000",
      accentShadowRed: "#E63946",
      accentShadowGold: "#F4B400",
      borderStrong: "#F4F0EA",
      borderSubtle: "rgba(244,240,234,0.32)",
      glassTop: "rgba(32, 32, 40, 0.78)",
      glassBottom: "rgba(18, 18, 24, 0.62)",
      glassInnerTop: "rgba(255, 255, 255, 0.08)",
      glassInnerBottom: "rgba(255, 255, 255, 0.03)",
      specular: "rgba(255, 255, 255, 0.25)",
      orbRed: "#E63946",
      orbGold: "#F4B400",
      orbCharcoal: "#3A3A48",
      textMain: "#F6F4F0",
      textMuted: "#B8B4AC",
      textInverse: "#0B0B0E",
      red: "#FF4D5A",
      redBg: "#E63946",
      gold: "#FFCC00",
      goldBg: "#F4B400",
      chipBg: "rgba(255, 255, 255, 0.07)",
      chipBorder: "#F4F0EA",
      chipShadow: "#000000",
      barBg: "rgba(255,255,255,0.08)",
    };
  }
  return {
    dark: false,
    canvasBg: "#F4F0EA",
    gridStroke: "rgba(17,17,21,0.06)",
    cardShadow: "#111115",
    accentShadowRed: "#D62828",
    accentShadowGold: "#E09F00",
    borderStrong: "#111115",
    borderSubtle: "rgba(17,17,21,0.28)",
    glassTop: "rgba(255, 255, 255, 0.82)",
    glassBottom: "rgba(255, 250, 242, 0.66)",
    glassInnerTop: "rgba(255, 255, 255, 0.72)",
    glassInnerBottom: "rgba(255, 255, 255, 0.45)",
    specular: "rgba(255, 255, 255, 0.9)",
    orbRed: "#FF5964",
    orbGold: "#FFD166",
    orbCharcoal: "#A8A49C",
    textMain: "#111115",
    textMuted: "#4A4843",
    textInverse: "#F6F4F0",
    red: "#D62828",
    redBg: "#E63946",
    gold: "#B87D00",
    goldBg: "#F4B400",
    chipBg: "rgba(255, 255, 255, 0.78)",
    chipBorder: "#111115",
    chipShadow: "#111115",
    barBg: "rgba(17,17,21,0.09)",
  };
}

const CSS = `
.up{animation:up .75s cubic-bezier(.16,1,.3,1) both}
.pop{transform-box:fill-box;transform-origin:center;animation:pop .55s cubic-bezier(.34,1.56,.64,1) both}
.fade{animation:fade .8s ease both}
.spin{transform-box:fill-box;transform-origin:center;animation:spin 36s linear infinite}
.spin-r{transform-box:fill-box;transform-origin:center;animation:spin 26s linear infinite reverse}
.bob{transform-box:fill-box;transform-origin:center;animation:bob 6s ease-in-out infinite}
.pulse{transform-box:fill-box;transform-origin:center;animation:pulse 8s ease-in-out infinite}
.grow{transform-box:fill-box;transform-origin:left center;animation:grow 1s cubic-bezier(.2,0,0,1) both}
.wave{animation:wave 2.6s linear infinite}
@keyframes up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes pop{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes pulse{0%,100%{transform:scale(1);opacity:.55}50%{transform:scale(1.12);opacity:.78}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes wave{from{transform:translateX(0)}to{transform:translateX(-48px)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

function svg(w, h, body, title, motion = true, extra = "") {
  const fonts = body.includes("<text")
    ? `@font-face{font-family:G;src:url(data:font/woff2;base64,${FONT}) format('woff2');font-weight:400 800}`
    : "";
  const css =
    fonts +
    `text{font-family:G,'Google Sans','Segoe UI',Roboto,sans-serif;font-variation-settings:'ROND' 100}` +
    CSS +
    extra +
    (motion ? "" : "*{animation:none!important}");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${+w.toFixed(2)}" height="${+h.toFixed(2)}" viewBox="0 0 ${+w.toFixed(2)} ${+h.toFixed(2)}" role="img" aria-label="${esc(title)}">` +
    `<title>${esc(title)}</title><style>${css}</style>${body}</svg>`
  );
}

// --- Glass + Brutalist Card Base ---
function glassBrutalShell(w, h, p, uid, opts = {}) {
  const ox = opts.shadowOffset ?? 6;
  const rx = opts.rx ?? 14;
  const cw = w - ox - 4;
  const ch = h - ox - 4;
  const shadowColor = opts.shadowColor ?? p.cardShadow;
  const orbs = opts.orbs ?? [
    { cx: cw * 0.82, cy: ch * 0.25, r: 95, color: p.orbRed },
    { cx: cw * 0.18, cy: ch * 0.78, r: 85, color: p.orbGold },
  ];

  const defs = [
    `<defs>`,
    `<linearGradient id="g-${uid}" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0%" stop-color="${p.glassTop}"/>`,
    `<stop offset="100%" stop-color="${p.glassBottom}"/>`,
    `</linearGradient>`,
    `<linearGradient id="gi-${uid}" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="${p.glassInnerTop}"/>`,
    `<stop offset="100%" stop-color="${p.glassInnerBottom}"/>`,
    `</linearGradient>`,
    `<linearGradient id="sh-${uid}" x1="0" y1="0" x2="1" y2="0.4">`,
    `<stop offset="0%" stop-color="${p.specular}"/>`,
    `<stop offset="55%" stop-color="rgba(255,255,255,0)"/>`,
    `</linearGradient>`,
    `<pattern id="grid-${uid}" width="24" height="24" patternUnits="userSpaceOnUse">`,
    `<path d="M 24 0 L 0 0 0 24" fill="none" stroke="${p.gridStroke}" stroke-width="1"/>`,
    `</pattern>`,
    `<filter id="blur-${uid}" x="-40%" y="-40%" width="180%" height="180%">`,
    `<feGaussianBlur stdDeviation="34"/>`,
    `</filter>`,
    `<clipPath id="clip-${uid}"><rect x="2" y="2" width="${cw}" height="${ch}" rx="${rx}"/></clipPath>`,
    `</defs>`,
  ].join("");

  const layers = [
    defs,
    // 1. Neo-Brutalist Hard Offset Shadow
    `<rect x="${2 + ox}" y="${2 + ox}" width="${cw}" height="${ch}" rx="${rx}" fill="${shadowColor}"/>`,
    // 2. Base Dark/Alabaster Backdrop inside card
    `<rect x="2" y="2" width="${cw}" height="${ch}" rx="${rx}" fill="${p.canvasBg}"/>`,
    // 3. Ambient Glowing Orbs & Architectural Grid (clipped)
    `<g clip-path="url(#clip-${uid})">`,
    ...orbs.map(
      (o, idx) =>
        `<circle class="pulse" style="animation-delay:${(idx * 1.3).toFixed(1)}s" cx="${o.cx.toFixed(1)}" cy="${o.cy.toFixed(1)}" r="${o.r}" fill="${o.color}" opacity="${p.dark ? "0.42" : "0.48"}" filter="url(#blur-${uid})"/>`
    ),
    `<rect x="2" y="2" width="${cw}" height="${ch}" fill="url(#grid-${uid})"/>`,
    // Frosted Glass Overlay
    `<rect x="2" y="2" width="${cw}" height="${ch}" fill="url(#g-${uid})"/>`,
    // Specular Diagonal Glare
    `<polygon points="2,2 ${Math.round(cw * 0.55)},2 ${Math.round(cw * 0.32)},${ch + 2} 2,${ch + 2}" fill="url(#sh-${uid})" opacity="0.45"/>`,
    // Top Specular Highlight Bar
    `<line x1="${2 + rx}" y1="3.5" x2="${cw - rx}" y2="3.5" stroke="${p.specular}" stroke-width="1.5"/>`,
    // Subtle German Tri-color Corner Tag (Top-Right Brutalist Detail)
    `<rect x="${cw - 76}" y="2" width="24" height="6" fill="#111115"/>`,
    `<rect x="${cw - 52}" y="2" width="24" height="6" fill="#E63946"/>`,
    `<rect x="${cw - 28}" y="2" width="26" height="6" fill="#F4B400"/>`,
    `<line x1="${cw - 76}" y1="8" x2="${cw + 2}" y2="8" stroke="${p.borderStrong}" stroke-width="1.5"/>`,
    `<line x1="${cw - 76}" y1="2" x2="${cw - 76}" y2="8" stroke="${p.borderStrong}" stroke-width="1.5"/>`,
    `</g>`,
    // 4. Crisp Neo-Brutalist Outer Stroke
    `<rect x="2" y="2" width="${cw}" height="${ch}" rx="${rx}" fill="none" stroke="${p.borderStrong}" stroke-width="2.5"/>`,
  ].join("");

  return { svg: layers, cw, ch };
}

// --- Section Header (Brutalist Sticker + Glass Label + Neo-Index) ---
function sectionHeader(x, y, label, ic, indexCode, { p, i }, delay = 0) {
  const b = [];
  // Brutalist Icon Box with hard shadow
  b.push(`<g class="pop" style="animation-delay:${delay.toFixed(2)}s">`);
  b.push(`<rect x="${x + 3}" y="${y + 3}" width="38" height="38" rx="8" fill="${p.cardShadow}"/>`);
  b.push(`<rect x="${x}" y="${y}" width="38" height="38" rx="8" fill="${p.goldBg}" stroke="${p.borderStrong}" stroke-width="2"/>`);
  b.push(icon(i, ic, x + 8, y + 8, 22, "#111115"));
  b.push(`</g>`);

  // Title text
  b.push(txt(x + 52, y + 27, fit(label.toUpperCase(), 21, W - x - 190, 700), 21, p.textMain, { weight: 700, cls: "up", delay: delay + 0.05, extra: ' letter-spacing="0.6"' }));

  // Right-side Brutalist Index Tag (e.g. // SEC-01)
  const tagW = textWidth(indexCode, 12, 700) + 22;
  const tx = W - 36 - tagW;
  b.push(`<g class="fade" style="animation-delay:${(delay + 0.1).toFixed(2)}s">`);
  b.push(`<rect x="${tx + 2}" y="${y + 8}" width="${tagW}" height="24" rx="5" fill="${p.cardShadow}"/>`);
  b.push(`<rect x="${tx}" y="${y + 6}" width="${tagW}" height="24" rx="5" fill="${p.chipBg}" stroke="${p.borderStrong}" stroke-width="1.75"/>`);
  b.push(txt(tx + tagW / 2, y + 22, indexCode, 12, p.textMain, { weight: 700, anchor: "middle", extra: ' letter-spacing="0.8"' }));
  b.push(`</g>`);

  // Brutalist Divider Line under header
  b.push(`<line x1="${x}" y1="${y + 48}" x2="${W - 36}" y2="${y + 48}" stroke="${p.borderSubtle}" stroke-width="1.5" stroke-dasharray="6 4"/>`);

  return b.join("");
}

// --- Glass + Brutalist Chip ---
function brutalChip(icons, p, x, y, label, o = {}) {
  const h = o.h ?? 36;
  const size = o.size ?? 14;
  const pad = 13;
  const iw = o.icon ? 18 : 0;
  const gap = o.icon ? 8 : 0;
  const w = pad * 2 + iw + gap + textWidth(label, size, 600);
  const rx = o.rx ?? 8;
  const so = o.shadowOffset ?? 3;

  let fill = p.chipBg;
  let fg = p.textMain;
  let iconColor = p.red;
  if (o.accent === "gold") {
    fill = p.goldBg;
    fg = "#111115";
    iconColor = "#111115";
  } else if (o.accent === "red") {
    fill = p.redBg;
    fg = "#FFFFFF";
    iconColor = "#FFFFFF";
  }

  let body = `<rect x="${(x + so).toFixed(1)}" y="${(y + so).toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="${rx}" fill="${p.chipShadow}"/>`;
  body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="${rx}" fill="${fill}" stroke="${p.chipBorder}" stroke-width="1.8"/>`;
  // Specular top line inside chip
  body += `<line x1="${(x + 6).toFixed(1)}" y1="${(y + 2).toFixed(1)}" x2="${(x + w - 6).toFixed(1)}" y2="${(y + 2).toFixed(1)}" stroke="${p.specular}" stroke-width="1"/>`;
  if (o.icon) body += icon(icons, o.icon, x + pad, y + (h - 18) / 2, 18, iconColor);
  body += txt(x + pad + iw + gap, y + h / 2 + size * 0.36, label, size, fg, { weight: 600 });
  return [pop(body, o.delay ?? 0), w + so];
}

// --- 1. HERO BLOCK ---
function hero(ctx, avatar) {
  const { c, p, i } = ctx;
  const h = 316;
  const shell = glassBrutalShell(W, h, p, "hero", {
    orbs: [
      { cx: 700, cy: 70, r: 120, color: p.orbRed },
      { cx: 520, cy: 250, r: 110, color: p.orbGold },
      { cx: 140, cy: 150, r: 95, color: p.orbRed },
    ],
  });
  const b = [shell.svg];

  // Top Brutalist Window Bar inside Hero
  b.push(`<rect x="24" y="20" width="12" height="12" rx="2" fill="#111115" stroke="${p.borderStrong}" stroke-width="1.5"/>`);
  b.push(`<rect x="42" y="20" width="12" height="12" rx="2" fill="#E63946" stroke="${p.borderStrong}" stroke-width="1.5"/>`);
  b.push(`<rect x="60" y="20" width="12" height="12" rx="2" fill="#F4B400" stroke="${p.borderStrong}" stroke-width="1.5"/>`);
  b.push(txt(84, 30, "PORTFOLIO // DEUTSCH-EDITION.SYS", 11, p.textMuted, { weight: 700, extra: ' letter-spacing="1.4"' }));
  b.push(`<line x1="24" y1="42" x2="${shell.cw - 20}" y2="42" stroke="${p.borderSubtle}" stroke-width="1.5"/>`);

  // Decorative floating Neo-Brutalist Glass Geometry on right
  b.push(`<g class="bob">`);
  b.push(`<rect x="752" y="58" width="52" height="52" rx="10" fill="${p.cardShadow}" transform="rotate(12 778 84)"/>`);
  b.push(`<rect x="748" y="54" width="52" height="52" rx="10" fill="${p.goldBg}" stroke="${p.borderStrong}" stroke-width="2" transform="rotate(12 774 80)"/>`);
  b.push(icon(i, "code", 761, 67, 26, "#111115"));
  b.push(`</g>`);

  // Avatar Neo-Brutalist Frame + Glass Backing
  const ax = 36;
  const ay = 66;
  const asize = 196;
  // Offset Red + Black Double Brutalist Shadow
  b.push(`<rect x="${ax + 10}" y="${ay + 10}" width="${asize}" height="${asize}" rx="18" fill="${p.cardShadow}"/>`);
  b.push(`<rect x="${ax + 5}" y="${ay + 5}" width="${asize}" height="${asize}" rx="18" fill="${p.redBg}" stroke="${p.borderStrong}" stroke-width="2"/>`);
  b.push(`<clipPath id="ava-clip"><rect x="${ax}" y="${ay}" width="${asize}" height="${asize}" rx="18"/></clipPath>`);
  b.push(`<rect x="${ax}" y="${ay}" width="${asize}" height="${asize}" rx="18" fill="url(#gi-hero)"/>`);

  if (avatar) {
    b.push(`<g class="fade"><image href="${avatar}" x="${ax}" y="${ay}" width="${asize}" height="${asize}" clip-path="url(#ava-clip)" preserveAspectRatio="xMidYMid slice"/></g>`);
  } else {
    // Stylized Brutalist Avatar Placeholder
    b.push(`<g clip-path="url(#ava-clip)">`);
    b.push(`<circle cx="${ax + asize / 2}" cy="${ay + asize / 2}" r="76" fill="${p.goldBg}" opacity="0.22"/>`);
    b.push(icon(i, "person", ax + 48, ay + 40, 100, p.textMain));
    b.push(`<rect x="${ax}" y="${ay + asize - 34}" width="${asize}" height="34" fill="${p.goldBg}" stroke="${p.borderStrong}" stroke-width="2"/>`);
    b.push(txt(ax + asize / 2, ay + asize - 12, "ENTWICKLER // ML", 12, "#111115", { weight: 700, anchor: "middle", extra: ' letter-spacing="1.1"' }));
    b.push(`</g>`);
  }
  b.push(`<rect x="${ax}" y="${ay}" width="${asize}" height="${asize}" rx="18" fill="none" stroke="${p.borderStrong}" stroke-width="2.5"/>`);

  // Hero Text Content
  const tx = 264;
  // Greeting Sticker Badge
  const greetText = c.hero.greeting.toUpperCase();
  const gw = textWidth(greetText, 13, 700) + 24;
  b.push(`<g class="up" style="animation-delay:0.08s">`);
  b.push(`<rect x="${tx + 3}" y="67" width="${gw.toFixed(1)}" height="28" rx="6" fill="${p.cardShadow}"/>`);
  b.push(`<rect x="${tx}" y="64" width="${gw.toFixed(1)}" height="28" rx="6" fill="${p.redBg}" stroke="${p.borderStrong}" stroke-width="2"/>`);
  b.push(txt(tx + 12, 83, greetText, 13, "#FFFFFF", { weight: 700, extra: ' letter-spacing="0.8"' }));
  b.push(`</g>`);

  // Main Name with Brutalist Drop Shadow
  const name = c.hero.name || c.login;
  const room = W - tx - 95;
  const size = Math.min(48, room / Math.max(1, textWidth(name, 1, 700)));
  b.push(
    pop(
      txt(tx + 2.5, 142.5, name, size, p.cardShadow, { weight: 700 }) +
        txt(tx, 140, name, size, p.textMain, { weight: 700 }),
      0.16,
      "up"
    )
  );

  // Subtitle inside Frosted Glass Sub-box
  const lines = wrap(c.hero.subtitle, 16, W - tx - 64, 500, 2);
  const subH = lines.length * 22 + 18;
  b.push(`<g class="up" style="animation-delay:0.26s">`);
  b.push(`<rect x="${tx}" y="156" width="${W - tx - 40}" height="${subH}" rx="10" fill="url(#gi-hero)" stroke="${p.borderSubtle}" stroke-width="1.5"/>`);
  b.push(`<rect x="${tx}" y="156" width="5" height="${subH}" rx="2.5" fill="${p.goldBg}"/>`);
  lines.forEach((line, n) => {
    b.push(txt(tx + 16, 178 + n * 22, line, 15.5, p.textMuted, { weight: 500 }));
  });
  b.push(`</g>`);

  // Chips Row
  let cx2 = tx;
  const cy2 = 236;
  c.hero.chips.forEach((item, n) => {
    const accent = n === 0 ? "gold" : n === 1 ? "default" : "default";
    const [g, w] = brutalChip(i, p, cx2, cy2, item.label, { icon: item.icon, delay: 0.4 + n * 0.08, accent });
    if (cx2 + w > W - 28) return;
    b.push(g);
    cx2 += w + 8;
  });

  return svg(W, h, b.join(""), `${c.hero.greeting} ${name}`, c.motion);
}

// --- 2. ABOUT BLOCK ---
function about(ctx) {
  const { c, p, i } = ctx;
  const row = 58;
  const h = 104 + row * c.about.items.length;
  const shell = glassBrutalShell(W, h, p, "about", {
    orbs: [
      { cx: 140, cy: h * 0.35, r: 100, color: p.orbGold },
      { cx: 700, cy: h * 0.7, r: 110, color: p.orbRed },
    ],
  });
  const b = [shell.svg];
  b.push(sectionHeader(28, 22, c.about.title, "person", "// PROFIL-01", ctx));

  c.about.items.forEach((item, n) => {
    const y = 84 + n * row;
    const cw = W - 64;
    const ch = row - 10;
    const badgeFill = n % 2 === 0 ? p.redBg : p.goldBg;
    const badgeFg = n % 2 === 0 ? "#FFFFFF" : "#111115";

    b.push(`<g class="up" style="animation-delay:${(0.12 + n * 0.08).toFixed(2)}s">`);
    // Brutalist offset shadow for each row card
    b.push(`<rect x="31" y="${y + 3}" width="${cw}" height="${ch}" rx="10" fill="${p.cardShadow}"/>`);
    b.push(`<rect x="28" y="${y}" width="${cw}" height="${ch}" rx="10" fill="url(#gi-about)" stroke="${p.borderStrong}" stroke-width="1.8"/>`);
    // Left Brutalist Icon Tag
    b.push(`<rect x="38" y="${y + 8}" width="32" height="32" rx="7" fill="${badgeFill}" stroke="${p.borderStrong}" stroke-width="1.6"/>`);
    b.push(icon(i, item.icon, 45, y + 15, 18, badgeFg));
    b.push(txt(82, y + 30, fit(item.label, 16, cw - 100, 600), 16, p.textMain, { weight: 600 }));
    b.push(`</g>`);
  });

  return svg(W, h, b.join(""), c.about.title, c.motion);
}

// --- 3. TECH STACK BLOCK ---
function stack(ctx) {
  const { c, p, i } = ctx;
  let y = 86;
  let d = 0.1;
  const groups = [];

  for (const [gi, group] of c.stack.groups.entries()) {
    if (group.title) {
      const gw = textWidth(group.title.toUpperCase(), 11.5, 700) + 20;
      const pillColor = gi % 2 === 0 ? p.goldBg : p.redBg;
      const pillFg = gi % 2 === 0 ? "#111115" : "#FFFFFF";
      groups.push(
        `<g class="fade" style="animation-delay:${d.toFixed(2)}s">` +
          `<rect x="30" y="${y + 2}" width="${gw.toFixed(1)}" height="22" rx="4" fill="${p.cardShadow}"/>` +
          `<rect x="28" y="${y}" width="${gw.toFixed(1)}" height="22" rx="4" fill="${pillColor}" stroke="${p.borderStrong}" stroke-width="1.5"/>` +
          txt(38, y + 15, group.title.toUpperCase(), 11.5, pillFg, { weight: 700, extra: ' letter-spacing="1.1"' }) +
          `<line x1="${(28 + gw + 10).toFixed(1)}" y1="${y + 11}" x2="${W - 36}" y2="${y + 11}" stroke="${p.borderSubtle}" stroke-width="1.2"/>` +
          `</g>`
      );
    }
    let x = 28;
    let cy = group.title ? y + 32 : y;
    for (const item of group.items) {
      const [, w] = brutalChip(i, p, 0, 0, item.label, { icon: item.icon });
      if (x + w > W - 32) {
        x = 28;
        cy += 46;
      }
      groups.push(brutalChip(i, p, x, cy, item.label, { icon: item.icon, delay: d })[0]);
      x += w + 8;
      d += 0.04;
    }
    y = cy + 38 + 24;
  }

  const h = y + 8;
  const shell = glassBrutalShell(W, h, p, "stack", {
    orbs: [
      { cx: 700, cy: 130, r: 120, color: p.orbRed },
      { cx: 160, cy: h * 0.55, r: 120, color: p.orbGold },
      { cx: 650, cy: h * 0.85, r: 110, color: p.orbRed },
    ],
  });
  const b = [shell.svg];
  b.push(sectionHeader(28, 22, c.stack.title, "code", "// STACK-02", ctx));
  b.push(...groups);
  return svg(W, h, b.join(""), c.stack.title, c.motion);
}

// --- 4. PROJECTS BLOCK ---
const LANG_ICONS = {
  Rust: "brand:rust",
  Python: "brand:python",
  TypeScript: "brand:typescript",
  JavaScript: "brand:javascript",
  "C#": "brand:dotnet",
  PHP: "brand:php",
  HTML: "brand:html5",
  CSS: "brand:css",
};

function projectList(c, d) {
  if (c.projects.source === "manual") {
    return c.projects.repos.map((n) => d.all.find((r) => r.name === n) || {
      name: n,
      url: `https://github.com/${c.login}/${n}`,
      text: c.projects.overrides[n]?.text || c.projects.empty,
      fork: false,
      stars: 0,
      language: "TypeScript",
      topics: [],
    });
  }
  return d.pins;
}

function projectView(c, repo, index) {
  const o = c.projects.overrides[repo.name] ?? {};
  const tags = [];
  if (repo.language) tags.push(repo.language);
  for (const t of (repo.topics || []).slice(0, 2)) {
    if (!tags.includes(t)) tags.push(t);
  }
  return {
    title: repo.name,
    text: o.text || repo.text || c.projects.empty,
    icon: o.icon || (repo.language && LANG_ICONS[repo.language]) || "deployed_code",
    tags,
  };
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

function card(ctx, repo, index) {
  const { c, p, i } = ctx;
  const w = 412;
  const h = 238;
  const d0 = 0.08 * index;
  const v = projectView(c, repo, index);
  const uid = `proj-${index}`;
  const shell = glassBrutalShell(w, h, p, uid, {
    shadowOffset: 5,
    orbs: [
      { cx: index % 2 === 0 ? 330 : 80, cy: 65, r: 80, color: index % 2 === 0 ? p.orbRed : p.orbGold },
      { cx: index % 2 === 0 ? 90 : 320, cy: 190, r: 75, color: index % 2 === 0 ? p.orbGold : p.orbRed },
    ],
  });
  const b = [shell.svg];

  // Top Brutalist Icon Sticker
  const badgeColor = index % 2 === 0 ? p.goldBg : p.redBg;
  const badgeFg = index % 2 === 0 ? "#111115" : "#FFFFFF";
  b.push(`<g class="pop" style="animation-delay:${d0.toFixed(2)}s">`);
  b.push(`<rect x="27" y="27" width="46" height="46" rx="10" fill="${p.cardShadow}"/>`);
  b.push(`<rect x="24" y="24" width="46" height="46" rx="10" fill="${badgeColor}" stroke="${p.borderStrong}" stroke-width="2"/>`);
  b.push(icon(i, v.icon, 35, 35, 24, badgeFg));
  b.push(`</g>`);

  // Top-right External Link Brutalist Button
  b.push(`<rect x="${w - 57}" y="27" width="36" height="36" rx="8" fill="${p.cardShadow}"/>`);
  b.push(`<rect x="${w - 60}" y="24" width="36" height="36" rx="8" fill="${p.chipBg}" stroke="${p.borderStrong}" stroke-width="1.8"/>`);
  b.push(icon(i, "arrow_outward", w - 51, 33, 18, p.textMain));

  // Index Tag
  b.push(txt(82, 43, `PROJEKT // 0${index + 1}`, 11, p.textMuted, { weight: 700, extra: ' letter-spacing="1.1"' }));

  // Repo Title
  const title = fit(v.title, 22, w - 54, 700);
  b.push(txt(24, 104, title, 22, p.textMain, { weight: 700, cls: "up", delay: d0 + 0.08 }));

  // Description lines
  wrap(v.text, 14.5, w - 54, 500, 2).forEach((line, n) => {
    b.push(txt(24, 130 + n * 20, line, 14.5, p.textMuted, { weight: 500, cls: "up", delay: d0 + 0.14 + n * 0.05 }));
  });

  // Bottom Divider & Tags + Stars
  b.push(`<line x1="24" y1="176" x2="${w - 28}" y2="176" stroke="${p.borderSubtle}" stroke-width="1.2" stroke-dasharray="4 3"/>`);
  let x = 24;
  v.tags.forEach((tag, n) => {
    const [g, cw] = brutalChip(i, p, x, 188, tag, { delay: d0 + 0.25 + n * 0.05, h: 28, size: 12.5, rx: 6, shadowOffset: 2.5 });
    if (x + cw < w - 95) {
      b.push(g);
      x += cw + 6;
    }
  });

  // Star Badge on Bottom Right
  const starStr = String(repo.stars);
  const sw = textWidth(starStr, 13.5, 700) + 38;
  const sx = w - 26 - sw;
  b.push(`<g class="pop" style="animation-delay:${(d0 + 0.35).toFixed(2)}s">`);
  b.push(`<rect x="${sx + 2.5}" y="190.5" width="${sw.toFixed(1)}" height="28" rx="6" fill="${p.cardShadow}"/>`);
  b.push(`<rect x="${sx.toFixed(1)}" y="188" width="${sw.toFixed(1)}" height="28" rx="6" fill="${p.goldBg}" stroke="${p.borderStrong}" stroke-width="1.6"/>`);
  b.push(icon(i, "star", sx + 8, 194, 16, "#111115"));
  b.push(txt(sx + 28, 207, starStr, 13.5, "#111115", { weight: 700 }));
  b.push(`</g>`);

  return svg(w, h, b.join(""), v.title, c.motion);
}

// --- 5. STATS BLOCK ---
function stats(ctx) {
  const { c, d, p, i } = ctx;
  const s = c.stats;
  const langs = s.showLanguages ? d.languages : [];
  const total = langs.reduce((a, [, v]) => a + v, 0) || 1;
  const legend = [];
  let lx = 28;
  let row = 0;
  for (const [name, v] of langs) {
    const label = `${name} ${((100 * v) / total).toFixed(1)}%`.replace(".0%", "%");
    const lw = 20 + textWidth(label, 13.5, 600) + 18;
    if (lx + lw > W - 36) {
      lx = 28;
      row++;
    }
    legend.push([lx, row, label]);
    lx += lw;
  }

  const h = s.showLanguages && langs.length ? 416 + row * 28 : 320;
  const shell = glassBrutalShell(W, h, p, "stats", {
    orbs: [
      { cx: 200, cy: 160, r: 110, color: p.orbRed },
      { cx: 640, cy: 200, r: 115, color: p.orbGold },
    ],
  });
  const b = [shell.svg];
  b.push(sectionHeader(28, 22, s.title, "monitoring", "// METRIKEN-03", ctx));

  // 4 Brutalist Metric Tiles on Left
  const tiles = [
    ["star", d.stars, s.stars, p.goldBg, "#111115"],
    ["commit", d.contributions, s.contributions, p.redBg, "#FFFFFF"],
    ["book_2", d.repos, s.repos, p.goldBg, "#111115"],
    ["group", d.followers, s.followers, p.redBg, "#FFFFFF"],
  ];

  tiles.forEach(([ic, value, label, badgeBg, badgeFg], n) => {
    const tx = 28 + (n % 2) * 194;
    const ty = 86 + Math.floor(n / 2) * 106;
    b.push(`<g class="up" style="animation-delay:${(0.1 + n * 0.07).toFixed(2)}s">`);
    b.push(`<rect x="${tx + 4}" y="${ty + 4}" width="182" height="94" rx="12" fill="${p.cardShadow}"/>`);
    b.push(`<rect x="${tx}" y="${ty}" width="182" height="94" rx="12" fill="url(#gi-stats)" stroke="${p.borderStrong}" stroke-width="2"/>`);
    b.push(`<rect x="${tx + 14}" y="${ty + 14}" width="34" height="34" rx="8" fill="${badgeBg}" stroke="${p.borderStrong}" stroke-width="1.6"/>`);
    b.push(icon(i, ic, tx + 22, ty + 22, 18, badgeFg));
    b.push(txt(tx + 58, ty + 42, String(value), 28, p.textMain, { weight: 700 }));
    b.push(txt(tx + 14, ty + 76, fit(label.toUpperCase(), 11.5, 154, 700), 11.5, p.textMuted, { weight: 700, extra: ' letter-spacing="0.6"' }));
    b.push(`</g>`);
  });

  // Right Side 21-Day Brutalist Contribution Matrix
  const rx = 430;
  b.push(txt(rx, 100, s.calendar.toUpperCase(), 12.5, p.textMain, { weight: 700, cls: "fade", delay: 0.1, extra: ' letter-spacing="0.8"' }));
  const gap = 6;
  const cw = (W - 36 - rx - gap * 6) / 7;
  const ch = 44;

  [...(s.weekdays + "       ").slice(0, 7)].forEach((letter, n) => {
    b.push(txt(rx + n * (cw + gap) + cw / 2, 122, letter, 11.5, p.textMuted, { weight: 700, cls: "fade", delay: 0.15, anchor: "middle" }));
  });

  const peak = Math.max(1, ...d.days.flat().map((x) => x?.c ?? 0));
  d.days.forEach((wk, wi) => {
    wk.forEach((day, di) => {
      const x = rx + di * (cw + gap);
      const y = 132 + wi * (ch + 6);
      const delay = 0.18 + (wi * 7 + di) * 0.02;
      if (!day) {
        b.push(`<rect class="pop" style="animation-delay:${delay.toFixed(3)}s" x="${x.toFixed(1)}" y="${y}" width="${cw.toFixed(1)}" height="${ch}" rx="8" fill="none" stroke="${p.borderSubtle}" stroke-width="1.5" stroke-dasharray="4 4"/>`);
        return;
      }
      const lvl = day.c === 0 ? 0 : Math.min(4, 1 + Math.floor((3 * day.c) / peak + 0.5));
      const fills = [p.chipBg, "rgba(244,180,0,0.35)", "#F4B400", "#E63946", "#D62828"];
      const fg = lvl === 2 ? "#111115" : lvl >= 3 ? "#FFFFFF" : p.textMain;
      let cell = `<rect x="${(x + 2).toFixed(1)}" y="${y + 2}" width="${cw.toFixed(1)}" height="${ch}" rx="8" fill="${p.cardShadow}"/>`;
      cell += `<rect x="${x.toFixed(1)}" y="${y}" width="${cw.toFixed(1)}" height="${ch}" rx="8" fill="${fills[lvl]}" stroke="${ day.today ? p.goldBg : p.borderStrong }" stroke-width="${day.today ? "2.5" : "1.6"}"/>`;
      cell += txt(x + cw / 2, y + ch / 2 + 5, String(day.day), 13.5, fg, { weight: 700, anchor: "middle" });
      b.push(`<g class="pop" style="animation-delay:${delay.toFixed(3)}s">${cell}</g>`);
    });
  });

  // Languages Bar & Legend
  if (s.showLanguages && langs.length) {
    const ly = 322;
    b.push(txt(28, ly, s.languages.toUpperCase(), 12.5, p.textMain, { weight: 700, cls: "fade", delay: 0.3, extra: ' letter-spacing="0.8"' }));
    const barColors = ["#E63946", "#F4B400", "#3178C6", "#2A9D8F", "#8338EC", "#FB8500", "#6C757D"];
    const bw = W - 64;
    // Brutalist Bar Frame
    b.push(`<rect x="31" y="${ly + 15}" width="${bw}" height="18" rx="6" fill="${p.cardShadow}"/>`);
    b.push(`<clipPath id="lang-clip"><rect x="28" y="${ly + 12}" width="${bw}" height="18" rx="6"/></clipPath>`);
    let sx = 28;
    const segs = langs.map(([, v], n) => {
      const sw = Math.max(10, (bw * v) / total);
      const r = `<rect x="${sx.toFixed(1)}" y="${ly + 12}" width="${(sw + 1).toFixed(1)}" height="18" fill="${barColors[n % barColors.length]}" stroke="${p.borderStrong}" stroke-width="1.5"/>`;
      sx += sw;
      return r;
    });
    b.push(`<g clip-path="url(#lang-clip)"><g class="grow" style="animation-delay:.38s">${segs.join("")}</g></g>`);
    b.push(`<rect x="28" y="${ly + 12}" width="${bw}" height="18" rx="6" fill="none" stroke="${p.borderStrong}" stroke-width="2"/>`);

    legend.forEach(([lx2, lrow, label], n) => {
      const ly2 = ly + 54 + lrow * 28;
      const col = barColors[n % barColors.length];
      b.push(
        pop(
          `<rect x="${lx2 + 1.5}" y="${ly2 - 11.5}" width="12" height="12" rx="3" fill="${p.cardShadow}"/>` +
            `<rect x="${lx2}" y="${ly2 - 13}" width="12" height="12" rx="3" fill="${col}" stroke="${p.borderStrong}" stroke-width="1.5"/>` +
            txt(lx2 + 18, ly2 - 2, label, 13.5, p.textMain, { weight: 600 }),
          0.5 + n * 0.05,
          "fade"
        )
      );
    });
  }

  return svg(W, h, b.join(""), s.title, c.motion);
}

// --- 6. STREAK BLOCK ---
function streak(ctx) {
  const { c, d, p, i } = ctx;
  const s = c.streak;
  const h = 218;
  const shell = glassBrutalShell(W, h, p, "streak", {
    orbs: [
      { cx: 220, cy: 120, r: 100, color: p.orbRed },
      { cx: 620, cy: 120, r: 100, color: p.orbGold },
    ],
  });
  const b = [shell.svg];
  b.push(sectionHeader(28, 22, s.title, "local_fire_department", "// SERIE-04", ctx));

  const tw = (W - 64 - 16) / 2;
  const tiles = [
    [d.streak.current, s.current, "local_fire_department", p.redBg, "#FFFFFF"],
    [d.streak.longest, s.longest, "trophy", p.goldBg, "#111115"],
  ];

  tiles.forEach(([value, label, ic, badgeBg, badgeFg], n) => {
    const tx = 28 + n * (tw + 16);
    const ty = 86;
    b.push(`<g class="up" style="animation-delay:${(0.12 + n * 0.1).toFixed(2)}s">`);
    b.push(`<rect x="${tx + 4}" y="${ty + 4}" width="${tw}" height="102" rx="14" fill="${p.cardShadow}"/>`);
    b.push(`<rect x="${tx}" y="${ty}" width="${tw}" height="102" rx="14" fill="url(#gi-streak)" stroke="${p.borderStrong}" stroke-width="2.2"/>`);
    // Icon Brutalist Box
    b.push(`<rect x="${tx + 21}" y="${ty + 25}" width="56" height="56" rx="12" fill="${p.cardShadow}"/>`);
    b.push(`<rect x="${tx + 18}" y="${ty + 22}" width="56" height="56" rx="12" fill="${badgeBg}" stroke="${p.borderStrong}" stroke-width="2"/>`);
    b.push(icon(i, ic, tx + 32, ty + 36, 28, badgeFg));

    const num = String(value);
    b.push(txt(tx + 92, ty + 56, num, 38, p.textMain, { weight: 700 }));
    b.push(txt(tx + 98 + textWidth(num, 38, 700), ty + 56, s.days, 15, p.textMuted, { weight: 700 }));
    b.push(txt(tx + 92, ty + 80, fit(label.toUpperCase(), 13, tw - 110, 700), 13, p.textMuted, { weight: 700, extra: ' letter-spacing="0.6"' }));
    b.push(`</g>`);
  });

  return svg(W, h, b.join(""), s.title, c.motion);
}

// --- 7. SOCIALS & BUTTONS ROWS ---
function socialLabel(icons, item) {
  if (item.icon.startsWith("brand:")) {
    const b = icons.brand[item.icon.slice(6)];
    if (b) return b.t;
  }
  try {
    return new URL(item.url).hostname.replace(/^www\./, "");
  } catch {
    return item.url;
  }
}

function socialPiece({ p, i }, item, n) {
  const label = socialLabel(i, item);
  const h = 48;
  const w = 18 + 22 + 10 + textWidth(label, 15, 700) + 22;
  const delay = n * 0.06;
  const accentBg = n === 0 ? p.goldBg : n === 2 ? p.redBg : p.chipBg;
  const fg = n === 0 ? "#111115" : n === 2 ? "#FFFFFF" : p.textMain;
  const icFg = n === 0 ? "#111115" : n === 2 ? "#FFFFFF" : p.red;

  const body = pop(
    `<rect x="4" y="4" width="${(w - 6).toFixed(1)}" height="${h - 6}" rx="10" fill="${p.cardShadow}"/>` +
      `<rect x="1.5" y="1.5" width="${(w - 6).toFixed(1)}" height="${h - 6}" rx="10" fill="${accentBg}" stroke="${p.borderStrong}" stroke-width="2"/>` +
      `<line x1="8" y1="3.5" x2="${(w - 12).toFixed(1)}" y2="3.5" stroke="${p.specular}" stroke-width="1"/>` +
      icon(i, item.icon, 16, 12, 20, icFg) +
      txt(46, 29, label, 15, fg, { weight: 700 }),
    delay
  );
  return { body, w, h, title: label };
}

function buttonPiece({ p, i }, btn, n) {
  const h = 54;
  const size = 15.5;
  const iw = btn.icon ? 28 : 0;
  const w = 48 + iw + textWidth(btn.label, size, 700);
  const isFilled = btn.style === "filled";
  const bg = isFilled ? p.goldBg : p.chipBg;
  const fg = isFilled ? "#111115" : p.textMain;
  const icFg = isFilled ? "#111115" : p.red;

  let body = `<rect x="5" y="5" width="${(w - 6).toFixed(1)}" height="${h - 6}" rx="12" fill="${p.cardShadow}"/>`;
  body += `<rect x="1.5" y="1.5" width="${(w - 6).toFixed(1)}" height="${h - 6}" rx="12" fill="${bg}" stroke="${p.borderStrong}" stroke-width="2.2"/>`;
  body += `<line x1="10" y1="3.5" x2="${(w - 14).toFixed(1)}" y2="3.5" stroke="${p.specular}" stroke-width="1.2"/>`;
  if (btn.icon) body += icon(i, btn.icon, 20, (h - 6 - 20) / 2 + 1.5, 20, icFg);
  body += txt(22 + iw, (h - 6) / 2 + 7, btn.label, size, fg, { weight: 700 });
  return { body: pop(body, n * 0.08), w, h, title: btn.label };
}

const GAP = 8;
const CAP = 28;

function rowFits(pieces) {
  return pieces.length > 0 && pieces.reduce((a, x) => a + x.w + GAP, 0) + CAP * 2 <= W;
}

function row(ctx, prefix, pieces, cardMode) {
  const { c, p } = ctx;
  const files = {};
  if (!cardMode || !rowFits(pieces)) {
    pieces.forEach((x, n) => (files[`${prefix}-${n + 1}`] = svg(x.w, x.h, x.body, x.title, c.motion)));
    return files;
  }
  const h = Math.max(...pieces.map((x) => x.h)) + 28;
  const cap = (W - pieces.reduce((a, x) => a + x.w + GAP, 0)) / 2;
  const bg = p.canvasBg;
  files[`${prefix}-l`] = svg(
    cap,
    h,
    `<rect x="2" y="2" width="${(cap + 40).toFixed(1)}" height="${h - 4}" rx="12" fill="${bg}" stroke="${p.borderStrong}" stroke-width="2"/>` +
      `<rect x="14" y="${h / 2 - 4}" width="8" height="8" fill="${p.redBg}"/>` +
      `<rect x="26" y="${h / 2 - 4}" width="8" height="8" fill="${p.goldBg}"/>`,
    "",
    c.motion
  );
  files[`${prefix}-r`] = svg(
    cap,
    h,
    `<rect x="-42" y="2" width="${(cap + 40).toFixed(1)}" height="${h - 4}" rx="12" fill="${bg}" stroke="${p.borderStrong}" stroke-width="2"/>` +
      `<rect x="${(cap - 34).toFixed(1)}" y="${h / 2 - 4}" width="8" height="8" fill="${p.goldBg}"/>` +
      `<rect x="${(cap - 22).toFixed(1)}" y="${h / 2 - 4}" width="8" height="8" fill="${p.redBg}"/>`,
    "",
    c.motion
  );
  pieces.forEach((x, n) => {
    const w = x.w + GAP;
    files[`${prefix}-${n + 1}`] = svg(
      w,
      h,
      `<rect y="2" width="${w + 1}" height="${h - 4}" fill="${bg}"/>` +
        `<line x1="0" y1="2" x2="${w + 1}" y2="2" stroke="${p.borderStrong}" stroke-width="2"/>` +
        `<line x1="0" y1="${h - 2}" x2="${w + 1}" y2="${h - 2}" stroke="${p.borderStrong}" stroke-width="2"/>` +
        `<g transform="translate(${GAP / 2} ${(h - x.h) / 2})">${x.body}</g>`,
      x.title,
      c.motion
    );
  });
  return files;
}

function socials(ctx) {
  return row(ctx, "social", ctx.c.socials.items.map((s, n) => socialPiece(ctx, s, n)), !!ctx.c.socials.card);
}

function buttons(ctx) {
  return row(ctx, "button", ctx.c.buttons.items.map((b, n) => buttonPiece(ctx, b, n)), false);
}

// --- 8. WAVE / BRUTALIST DIVIDER ---
function wave({ c, p }) {
  const h = 36;
  const b = [
    `<rect x="4" y="8" width="${W - 8}" height="20" rx="6" fill="${p.cardShadow}"/>`,
    `<rect x="2" y="6" width="${W - 8}" height="20" rx="6" fill="${p.chipBg}" stroke="${p.borderStrong}" stroke-width="2"/>`,
    `<clipPath id="w-clip"><rect x="4" y="8" width="${W - 12}" height="16" rx="4"/></clipPath>`,
    `<g clip-path="url(#w-clip)">`,
  ];
  for (let x = -48; x < W + 48; x += 24) {
    const col = (x / 24) % 3 === 0 ? "#111115" : (x / 24) % 3 === 1 ? "#E63946" : "#F4B400";
    b.push(`<polygon class="wave" points="${x},24 ${x + 12},8 ${x + 22},8 ${x + 10},24" fill="${col}" opacity="0.85"/>`);
  }
  b.push(`</g>`);
  return svg(W, h, b.join(""), "divider", c.motion);
}

function credit({ p }) {
  const label = "ARCHITECTED WITH GLASSMORPHISM × NEO-BRUTALISM // EXPRESSIVE PROFILE";
  const size = 11;
  const w = textWidth(label, size, 700) + 24;
  return svg(
    w,
    24,
    txt(w / 2, 16, label, size, p.textMuted, { weight: 700, anchor: "middle", extra: ' letter-spacing="1.1"' }),
    label,
    false
  );
}

// --- Full Render Pipeline ---
function renderAll(c, d, icons, avatar, themes = ["light", "dark"]) {
  const files = {};
  const repos = projectList(c, d);
  for (const theme of themes) {
    const p = getTheme(theme === "dark");
    const ctx = { c, d, p, i: icons };
    const put = (name, content) => (files[`assets/${name}-${theme}.svg`] = content);
    put("hero", hero(ctx, avatar));
    put("about", about(ctx));
    put("stack", stack(ctx));
    put("stats", stats(ctx));
    put("wave", wave(ctx));
    put("streak", streak(ctx));
    for (const [name, content] of Object.entries(socials(ctx))) put(name, content);
    for (const [name, content] of Object.entries(buttons(ctx))) put(name, content);
    put("credit", credit(ctx));
    repos.forEach((r, n) => put(`project-${slug(r.name)}`, card(ctx, r, n)));
  }
  return files;
}

// --- README Generator ---
function buttonUrl(c, url) {
  return url || `https://github.com/${c.login}?tab=repositories`;
}

function pic(name, alt, width = "100%") {
  return (
    `<picture><source media="(prefers-color-scheme: dark)" srcset="assets/${name}-dark.svg">` +
    `<img src="assets/${name}-light.svg" width="${width}" alt="${esc(alt)}"></picture>`
  );
}

function linkRow(files, prefix, links, loose, sep) {
  const width = (name) => Number(/width="([\d.]+)"/.exec(files[`assets/${name}-light.svg`] ?? "")?.[1] ?? 0);
  if (files[`assets/${prefix}-l-light.svg`]) {
    const pct = (name) => `${(Math.floor((width(name) / 840) * 100000) / 1000).toFixed(3)}%`;
    return (
      pic(`${prefix}-l`, "", pct(`${prefix}-l`)) +
      links.map((l, n) => `<a href="${esc(l.url)}">${pic(`${prefix}-${n + 1}`, l.alt, pct(`${prefix}-${n + 1}`))}</a>`).join("") +
      pic(`${prefix}-r`, "", pct(`${prefix}-r`))
    );
  }
  return links.map((l, n) => `<a href="${esc(l.url)}">${pic(`${prefix}-${n + 1}`, l.alt, loose)}</a>`).join(sep);
}

function buildReadme(c, d, files) {
  const repos = projectList(c, d);
  const parts = [];
  for (const id of c.order) {
    if (c.hidden.includes(id)) continue;
    if (id === "hero") parts.push(pic("hero", `${c.hero.greeting} ${c.hero.name || c.login}`));
    if (id === "about") parts.push(pic("about", c.about.title));
    if (id === "stack") parts.push(pic("stack", c.stack.title));
    if (id === "stats") parts.push(pic("stats", c.stats.title));
    if (id === "wave") parts.push(pic("wave", ""));
    if (id === "streak") parts.push(pic("streak", c.streak.title));
    if (id === "socials" && c.socials.items.length) {
      const links = c.socials.items.map((s) => ({ url: s.url, alt: s.icon.replace("brand:", "") }));
      parts.push(linkRow(files, "social", links, "auto", "&nbsp;"));
    }
    if (id === "projects") {
      const cards = repos.map((r) => `<a href="${esc(r.url)}">${pic(`project-${slug(r.name)}`, r.name, "49%")}</a>`);
      for (let n = 0; n < cards.length; n += 2) parts.push(cards.slice(n, n + 2).join("&nbsp;"));
    }
    if (id === "buttons" && c.buttons.items.length) {
      const links = c.buttons.items.map((b) => ({ url: buttonUrl(c, b.url), alt: b.label }));
      parts.push(linkRow(files, "button", links, "auto", "&nbsp;&nbsp;"));
    }
  }
  parts.push(`<a href="https://metawka.github.io/expressive-profile/?from=${encodeURIComponent(c.login)}">${pic("credit", "Made with Expressive Profile", "auto")}</a>`);
  return '<div align="center">\n\n' + parts.join("\n\n") + "\n\n</div>\n";
}

// --- GitHub GraphQL Data Fetcher (with graceful fallback for placeholder usernames) ---
const NOISE = new Set(["Inno Setup", "Batchfile", "PowerShell", "VBScript", "Shell", "Makefile", "Dockerfile"]);
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

async function graphql(query, variables = {}) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "User-Agent": "expressive-profile-brutalist" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

function streakOf(counts, todayIncluded = true) {
  let longest = 0;
  let run = 0;
  for (const c of counts) {
    run = c > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let current = 0;
  let i = counts.length - 1;
  if (todayIncluded && i >= 0 && counts[i] === 0) i--;
  for (; i >= 0 && counts[i] > 0; i--) current++;
  return { current, longest };
}

async function fetchLiveGitHubData(login, fallback) {
  if (!token || !login || login.includes("[") || login.includes(" ")) {
    return fallback;
  }
  try {
    const REPO = `name url description isFork stargazerCount primaryLanguage{name} repositoryTopics(first:10){nodes{topic{name}}}`;
    const LANGS = "languages(first:10,orderBy:{field:SIZE,direction:DESC}){edges{size node{name}}}";
    const { user } = await graphql(
      `query($login:String!){user(login:$login){
        followers{totalCount}
        repositories(ownerAffiliations:OWNER,privacy:PUBLIC,first:100,orderBy:{field:STARGAZERS,direction:DESC}){totalCount nodes{${REPO} ${LANGS}}}
        pinnedItems(first:6,types:REPOSITORY){nodes{... on Repository{${REPO}}}}
        contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{contributionCount date weekday}}}}}}`,
      { login }
    );
    const mapRepo = (n) => ({
      name: n.name,
      url: n.url,
      text: (n.description || "").trim(),
      fork: n.isFork,
      stars: n.stargazerCount,
      language: n.primaryLanguage?.name ?? null,
      topics: n.repositoryTopics.nodes.map((t) => t.topic.name),
    });
    const sumLangs = (nodes) => {
      const sum = {};
      for (const r of nodes) {
        if (r.isFork) continue;
        for (const e of r.languages?.edges ?? []) if (!NOISE.has(e.node.name)) sum[e.node.name] = (sum[e.node.name] ?? 0) + e.size;
      }
      return Object.entries(sum).sort((a, b) => b[1] - a[1]).slice(0, 7);
    };
    const nodes = user.repositories.nodes;
    const today = new Date().toISOString().slice(0, 10);
    const days = [];
    for (const w of user.contributionsCollection.contributionCalendar.weeks.slice(-3)) {
      const row = Array(7).fill(null);
      for (const d of w.contributionDays) row[d.weekday] = { c: d.contributionCount, day: +d.date.slice(8), today: d.date === today };
      days.push(row);
    }
    while (days.length < 3) days.unshift(Array(7).fill(null));
    const counts = user.contributionsCollection.contributionCalendar.weeks
      .flatMap((w) => w.contributionDays)
      .filter((d) => d.date <= today)
      .map((d) => d.contributionCount);
    return {
      stars: nodes.filter((r) => !r.isFork).reduce((a, r) => a + r.stargazerCount, 0),
      contributions: user.contributionsCollection.contributionCalendar.totalContributions,
      repos: user.repositories.totalCount,
      followers: user.followers.totalCount,
      languages: sumLangs(nodes),
      days,
      streak: streakOf(counts),
      pins: user.pinnedItems.nodes.filter(Boolean).map(mapRepo),
      all: nodes.map(mapRepo),
    };
  } catch (e) {
    console.warn("Using cached/placeholder data:", e.message);
    return fallback;
  }
}

async function fetchAvatar(login) {
  if (!login || login.includes("[") || login.includes(" ")) return null;
  try {
    const r = await fetch(`https://github.com/${login}.png?size=320`);
    if (!r.ok) return null;
    const type = r.headers.get("content-type") || "image/png";
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

async function main() {
  const config = JSON.parse(readFileSync("profile.json", "utf8"));
  const icons = JSON.parse(readFileSync(".profile/icons.json", "utf8"));
  const cached = existsSync(".profile/data.json") ? JSON.parse(readFileSync(".profile/data.json", "utf8")) : null;
  const data = await fetchLiveGitHubData(config.login, cached);
  const ava = await fetchAvatar(config.login);

  writeFileSync(".profile/data.json", JSON.stringify(data, null, 2) + "\n", "utf8");
  const files = renderAll(config, data, icons, ava);
  mkdirSync("assets", { recursive: true });
  for (const f of readdirSync("assets")) {
    if (f.endsWith(".svg") && !files[`assets/${f}`]) unlinkSync(`assets/${f}`);
  }
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content, "utf8");
  }
  writeFileSync("README.md", buildReadme(config, data, files), "utf8");
  console.log("Rendered", Object.keys(files).length, "Glassmorphism × Brutalism SVGs.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

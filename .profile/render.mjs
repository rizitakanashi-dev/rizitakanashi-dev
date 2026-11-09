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

// --- Pure Tactile Neumorphism Theme System + Neo-Brutalist Structural Accents ---
function getTheme(dark) {
  if (dark) {
    return {
      dark: true,
      // Base Neumorphic Slate-Charcoal Surface
      surface: "#1E222B",
      surfaceRaised: "#222731",
      surfaceSunken: "#181B23",
      // Dual Soft Neumorphic Shadows (Top-Left Light, Bottom-Right Dark)
      shLight: "#2B313E",
      shDark: "#101218",
      // Inner Sunken Gradients
      wellGradTop: "#13161D",
      wellGradBot: "#262B36",
      // Raised Convex Gradients
      convexTop: "#252A35",
      convexBot: "#1B1F27",
      // Subtle Tactile Rim Highlights
      rimLight: "rgba(255, 255, 255, 0.065)",
      rimDark: "rgba(0, 0, 0, 0.55)",
      // Typography
      textMain: "#F0F4F8",
      textMuted: "#9BA4B5",
      textSoft: "#6C7586",
      // Vibrant Accents (German Editorial Crimson & Gold + Neo-Vibrant Purple/Blue)
      red: "#FF4D5E",
      gold: "#FFB800",
      purple: "#A855F7",
      blue: "#38BDF8",
      green: "#22C55E",
      brutalBorder: "#323846",
    };
  }
  return {
    dark: false,
    // Classic Soft Alabaster-Gray Neumorphic Surface (matches reference image)
    surface: "#ECEFF4",
    surfaceRaised: "#F1F4F9",
    surfaceSunken: "#E2E6EE",
    // Dual Soft Neumorphic Shadows (Pure White Top-Left, Cool Gray-Blue Bottom-Right)
    shLight: "#FFFFFF",
    shDark: "#C5CEDB",
    // Inner Sunken Gradients
    wellGradTop: "#CFD7E3",
    wellGradBot: "#FAFCFF",
    // Raised Convex Gradients
    convexTop: "#F7F9FC",
    convexBot: "#E4E8F0",
    // Subtle Tactile Rim Highlights
    rimLight: "rgba(255, 255, 255, 0.92)",
    rimDark: "rgba(175, 186, 204, 0.45)",
    // Typography
    textMain: "#1E2430",
    textMuted: "#5A6578",
    textSoft: "#8490A5",
    // Vibrant Accents
    red: "#E11D48",
    gold: "#D97706",
    purple: "#9333EA",
    blue: "#0284C7",
    green: "#16A34A",
    brutalBorder: "#D0D7E2",
  };
}

const CSS = `
.up{animation:up .75s cubic-bezier(.16,1,.3,1) both}
.pop{transform-box:fill-box;transform-origin:center;animation:pop .55s cubic-bezier(.34,1.56,.64,1) both}
.fade{animation:fade .8s ease both}
.bob{transform-box:fill-box;transform-origin:center;animation:bob 6s ease-in-out infinite}
.grow{transform-box:fill-box;transform-origin:left center;animation:grow 1s cubic-bezier(.2,0,0,1) both}
.wave{animation:wave 3s linear infinite}
@keyframes up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes pop{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
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

// --- Neumorphic SVG Filter & Gradient Definitions ---
// Using standard feGaussianBlur + feOffset + feMerge (NO colorSpaceInterpolation bugs!)
function neuDefs(p, uid) {
  return [
    `<defs>`,
    // 1. Medium Extruded Shadow (for Cards, Pills, Buttons)
    `<filter id="ext-${uid}" x="-25%" y="-25%" width="150%" height="150%">`,
    `<feDropShadow dx="-5" dy="-5" stdDeviation="5" flood-color="${p.shLight}" flood-opacity="${p.dark ? "0.7" : "0.95"}"/>`,
    `<feDropShadow dx="5" dy="5" stdDeviation="6" flood-color="${p.shDark}" flood-opacity="${p.dark ? "0.85" : "0.65"}"/>`,
    `</filter>`,
    // 2. Small Tactile Extruded Shadow (for Chips, Knobs, Circular Discs)
    `<filter id="sm-${uid}" x="-30%" y="-30%" width="160%" height="160%">`,
    `<feDropShadow dx="-3" dy="-3" stdDeviation="3" flood-color="${p.shLight}" flood-opacity="${p.dark ? "0.75" : "0.98"}"/>`,
    `<feDropShadow dx="3" dy="3" stdDeviation="3.5" flood-color="${p.shDark}" flood-opacity="${p.dark ? "0.85" : "0.6"}"/>`,
    `</filter>`,
    // 3. Soft Raised Convex Surface Gradient
    `<linearGradient id="cvx-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">`,
    `<stop offset="0%" stop-color="${p.convexTop}"/>`,
    `<stop offset="100%" stop-color="${p.convexBot}"/>`,
    `</linearGradient>`,
    // 4. Sunken / Recessed Well Gradient (Darker Top-Left, Lighter Bottom-Right)
    `<linearGradient id="well-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">`,
    `<stop offset="0%" stop-color="${p.wellGradTop}"/>`,
    `<stop offset="55%" stop-color="${p.surfaceSunken}"/>`,
    `<stop offset="100%" stop-color="${p.wellGradBot}"/>`,
    `</linearGradient>`,
    // 5. Diagonal Rim Bevel for Sunken Wells (Dark Top-Left, White Bottom-Right)
    `<linearGradient id="well-rim-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">`,
    `<stop offset="0%" stop-color="${p.shDark}" stop-opacity="0.8"/>`,
    `<stop offset="50%" stop-color="${p.surface}" stop-opacity="0"/>`,
    `<stop offset="100%" stop-color="${p.shLight}" stop-opacity="0.9"/>`,
    `</linearGradient>`,
    // 6. Diagonal Rim Bevel for Raised Elements (White Top-Left, Dark Bottom-Right)
    `<linearGradient id="cvx-rim-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">`,
    `<stop offset="0%" stop-color="${p.shLight}" stop-opacity="${p.dark ? "0.4" : "0.95"}"/>`,
    `<stop offset="50%" stop-color="${p.surface}" stop-opacity="0"/>`,
    `<stop offset="100%" stop-color="${p.shDark}" stop-opacity="0.55"/>`,
    `</linearGradient>`,
    // 7. Accent Bar Gradient (German Red -> Gold)
    `<linearGradient id="acc-${uid}" x1="0%" y1="0%" x2="100%" y2="0%">`,
    `<stop offset="0%" stop-color="${p.red}"/>`,
    `<stop offset="100%" stop-color="${p.gold}"/>`,
    `</linearGradient>`,
    `</defs>`,
  ].join("");
}

// --- Neumorphic Building Blocks ---

// 1. Outer Neumorphic Card Base (Full-bleed rounded board so all inner shadows have a matching canvas)
function neuBoard(w, h, p, uid, rx = 28) {
  return [
    neuDefs(p, uid),
    // Main soft tactile board
    `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${rx}" fill="${p.surface}" stroke="url(#cvx-rim-${uid})" stroke-width="2"/>`,
    // Inner subtle ambient recess line
    `<rect x="10" y="10" width="${w - 20}" height="${h - 20}" rx="${rx - 6}" fill="none" stroke="${p.rimLight}" stroke-width="1"/>`,
  ].join("");
}

// 2. Sunken / Recessed Neumorphic Well (Groove / Track / Socket)
function neuWell(x, y, w, h, rx, uid) {
  return [
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}" fill="url(#well-${uid})"/>`,
    `<rect x="${(x + 0.75).toFixed(1)}" y="${(y + 0.75).toFixed(1)}" width="${(w - 1.5).toFixed(1)}" height="${(h - 1.5).toFixed(1)}" rx="${Math.max(1, rx - 0.75)}" fill="none" stroke="url(#well-rim-${uid})" stroke-width="1.5"/>`,
  ].join("");
}

// 3. Raised / Extruded Neumorphic Plateau
function neuRaised(x, y, w, h, rx, uid, filter = "ext") {
  return [
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}" fill="url(#cvx-${uid})" filter="url(#${filter}-${uid})"/>`,
    `<rect x="${(x + 0.6).toFixed(1)}" y="${(y + 0.6).toFixed(1)}" width="${(w - 1.2).toFixed(1)}" height="${(h - 1.2).toFixed(1)}" rx="${Math.max(1, rx - 0.6)}" fill="none" stroke="url(#cvx-rim-${uid})" stroke-width="1.2"/>`,
  ].join("");
}

// 4. Double-Layered Neumorphic Pill (Sunken outer well + Raised inner plateau — just like the "NEUMORPHIC" centerpiece in reference!)
function neuDoublePill(x, y, w, h, rx, uid, pad = 5) {
  const irx = Math.max(4, rx - pad);
  return (
    neuWell(x, y, w, h, rx, uid) +
    neuRaised(x + pad, y + pad, w - pad * 2, h - pad * 2, irx, uid, "sm")
  );
}

// 5. Raised Circular Neumorphic Button / Icon Disc
function neuCircleDisc(cx, cy, r, uid, filter = "sm") {
  return [
    `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="url(#cvx-${uid})" filter="url(#${filter}-${uid})"/>`,
    `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r - 0.6).toFixed(1)}" fill="none" stroke="url(#cvx-rim-${uid})" stroke-width="1.2"/>`,
  ].join("");
}

// 6. Sunken Circular Neumorphic Socket
function neuCircleWell(cx, cy, r, uid) {
  return [
    `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="url(#well-${uid})"/>`,
    `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r - 0.75).toFixed(1)}" fill="none" stroke="url(#well-rim-${uid})" stroke-width="1.5"/>`,
  ].join("");
}

// --- Section Header (Sunken Well + Raised Icon Disc + Title + Sunken Tri-Color Status Well) ---
function sectionHeader(x, y, label, ic, indexCode, { p, i }, uid, delay = 0) {
  const b = [];
  // Double-ring icon socket (Sunken circle + Raised inner circle)
  const cx = x + 22;
  const cy = y + 22;
  b.push(`<g class="pop" style="animation-delay:${delay.toFixed(2)}s">`);
  b.push(neuCircleWell(cx, cy, 22, uid));
  b.push(neuCircleDisc(cx, cy, 16, uid, "sm"));
  b.push(icon(i, ic, cx - 9, cy - 9, 18, p.red));
  b.push(`</g>`);

  // Section Title
  b.push(txt(x + 56, y + 29, fit(label, 20, W - x - 240, 700), 20, p.textMain, { weight: 700, cls: "up", delay: delay + 0.05 }));

  // Right side: Sunken Index Pill + German Tri-Color LED Dots (No overlap!)
  const tagW = Math.round(textWidth(indexCode, 11, 700) + indexCode.length * 0.8 + 70);
  const tx = W - 34 - tagW;
  b.push(`<g class="fade" style="animation-delay:${(delay + 0.1).toFixed(2)}s">`);
  b.push(neuWell(tx, y + 8, tagW, 28, 14, uid));
  // 3 Tactile German LEDs inside left of the sunken pill
  b.push(`<circle cx="${tx + 15}" cy="${y + 22}" r="3.5" fill="${p.dark ? "#4B5563" : "#1E2430"}"/>`);
  b.push(`<circle cx="${tx + 26}" cy="${y + 22}" r="3.5" fill="${p.red}"/>`);
  b.push(`<circle cx="${tx + 37}" cy="${y + 22}" r="3.5" fill="${p.gold}"/>`);
  b.push(txt(tx + 49, y + 26, indexCode, 11, p.textMuted, { weight: 700, extra: ' letter-spacing="0.6"' }));
  b.push(`</g>`);

  // Soft Neumorphic Carved Groove Line under header
  b.push(neuWell(x, y + 54, W - x * 2, 4, 2, uid));

  return b.join("");
}

// --- Tactile Neumorphic Chip (Raised Pill with Sunken Icon Socket) ---
function neuChip(icons, p, x, y, label, uid, o = {}) {
  const h = o.h ?? 38;
  const size = o.size ?? 13.5;
  const iw = o.icon ? 24 : 0;
  const gap = o.icon ? 8 : 0;
  const pad = 14;
  const w = pad * 2 + iw + gap + textWidth(label, size, 600);
  const rx = o.rx ?? Math.round(h / 2);

  const iconColor = o.iconColor ?? (o.accent === "gold" ? p.gold : o.accent === "red" ? p.red : p.red);
  let body = neuRaised(x, y, w, h, rx, uid, "sm");

  if (o.icon) {
    const icx = x + pad + 10;
    const icy = y + h / 2;
    body += neuCircleWell(icx, icy, 12, uid);
    body += icon(icons, o.icon, icx - 7.5, icy - 7.5, 15, iconColor);
  }
  body += txt(x + pad + iw + gap, y + h / 2 + size * 0.36, label, size, p.textMain, { weight: 600 });
  return [pop(body, o.delay ?? 0), w];
}

// --- 1. HERO BLOCK ---
function hero(ctx, avatar) {
  const { c, p, i } = ctx;
  const h = 324;
  const uid = "hero";
  const b = [neuBoard(W, h, p, uid)];

  // Top Left & Right Tactile Status Bar
  b.push(neuWell(34, 22, 232, 24, 12, uid));
  b.push(`<circle cx="48" cy="34" r="3.5" fill="${p.dark ? "#4B5563" : "#1E2430"}"/>`);
  b.push(`<circle cx="60" cy="34" r="3.5" fill="${p.red}"/>`);
  b.push(`<circle cx="72" cy="34" r="3.5" fill="${p.gold}"/>`);
  b.push(txt(86, 38, "NEUMORPHIC // DEUTSCH", 10.5, p.textMuted, { weight: 700, extra: ' letter-spacing="0.8"' }));

  // Top-Right Decorative Neumorphic Equalizer Sliders (Inspired directly by the user's reference image!)
  const eqX = 696;
  const eqY = 24;
  const sliders = [0.65, 0.35, 0.78, 0.45];
  sliders.forEach((val, idx) => {
    const sx = eqX + idx * 28;
    const sh = 54;
    const fillH = Math.round(sh * val);
    const fillY = eqY + sh - fillH;
    const col = idx % 2 === 0 ? p.red : p.gold;
    b.push(neuWell(sx, eqY, 8, sh, 4, uid));
    b.push(`<rect x="${sx + 1}" y="${fillY}" width="6" height="${fillH}" rx="3" fill="${col}"/>`);
    b.push(neuCircleDisc(sx + 4, fillY, 6.5, uid, "sm"));
  });

  // Avatar Tactile Double-Ring Frame (Sunken Outer Well -> Raised Cushion -> Circular Clip)
  const ax = 42;
  const ay = 68;
  const asize = 192;
  const acx = ax + asize / 2;
  const acy = ay + asize / 2;
  b.push(neuWell(ax - 8, ay - 8, asize + 16, asize + 16, 44, uid));
  b.push(neuRaised(ax, ay, asize, asize, 36, uid, "ext"));
  b.push(`<clipPath id="ava-clip"><rect x="${ax + 8}" y="${ay + 8}" width="${asize - 16}" height="${asize - 16}" rx="28"/></clipPath>`);
  if (avatar) {
    b.push(`<g class="fade"><image href="${avatar}" x="${ax + 8}" y="${ay + 8}" width="${asize - 16}" height="${asize - 16}" clip-path="url(#ava-clip)" preserveAspectRatio="xMidYMid slice"/></g>`);
  } else {
    b.push(`<g clip-path="url(#ava-clip)">`);
    b.push(`<rect x="${ax + 8}" y="${ay + 8}" width="${asize - 16}" height="${asize - 16}" fill="${p.surfaceSunken}"/>`);
    b.push(icon(i, "person", acx - 44, acy - 44, 88, p.textMuted));
    b.push(`</g>`);
  }
  b.push(`<rect x="${ax + 8}" y="${ay + 8}" width="${asize - 16}" height="${asize - 16}" rx="28" fill="none" stroke="url(#well-rim-${uid})" stroke-width="2"/>`);

  // Hero Text Area
  const tx = 264;
  // Double-layered Neumorphic Greeting Pill (like the "NEUMORPHIC" centerpiece in reference)
  const greetText = c.hero.greeting.toUpperCase();
  const gw = Math.round(textWidth(greetText, 12, 700) + greetText.length * 0.9 + 54);
  b.push(`<g class="up" style="animation-delay:0.08s">`);
  b.push(neuDoublePill(tx, 62, gw, 36, 18, uid, 4));
  b.push(`<circle cx="${tx + 18}" cy="80" r="3.5" fill="${p.red}"/>`);
  b.push(txt(tx + 28, 84, greetText, 12, p.red, { weight: 700, extra: ' letter-spacing="0.8"' }));
  b.push(`</g>`);

  // Main Name
  const name = c.hero.name || c.login;
  const room = W - tx - 160;
  const size = Math.min(44, room / Math.max(1, textWidth(name, 1, 700)));
  b.push(pop(txt(tx, 142, name, size, p.textMain, { weight: 700 }), 0.16, "up"));

  // Subtitle inside Sunken Neumorphic Well with Left Accent Pill
  const lines = wrap(c.hero.subtitle, 15, W - tx - 64, 500, 2);
  const subH = lines.length * 22 + 20;
  b.push(`<g class="up" style="animation-delay:0.24s">`);
  b.push(neuWell(tx, 158, W - tx - 36, subH, 16, uid));
  b.push(`<rect x="${tx + 10}" y="168" width="4" height="${subH - 20}" rx="2" fill="url(#acc-${uid})"/>`);
  lines.forEach((line, n) => {
    b.push(txt(tx + 24, 181 + n * 22, line, 15, p.textMuted, { weight: 500 }));
  });
  b.push(`</g>`);

  // Hero Chips Row
  let cx2 = tx;
  const cy2 = 242;
  c.hero.chips.forEach((item, n) => {
    const accent = n === 0 ? "gold" : "red";
    const [g, cw] = neuChip(i, p, cx2, cy2, item.label, uid, { icon: item.icon, delay: 0.35 + n * 0.08, accent });
    if (cx2 + cw > W - 32) return;
    b.push(g);
    cx2 += cw + 12;
  });

  return svg(W, h, b.join(""), `${c.hero.greeting} ${name}`, c.motion);
}

// --- 2. ABOUT BLOCK ---
function about(ctx) {
  const { c, p, i } = ctx;
  const row = 62;
  const h = 108 + row * c.about.items.length;
  const uid = "about";
  const b = [neuBoard(W, h, p, uid)];
  b.push(sectionHeader(34, 24, c.about.title, "person", "PROFIL // 01", ctx, uid));

  c.about.items.forEach((item, n) => {
    const y = 94 + n * row;
    const cw = W - 68;
    const ch = row - 12;

    b.push(`<g class="up" style="animation-delay:${(0.12 + n * 0.08).toFixed(2)}s">`);
    // Raised Neumorphic Row Card
    b.push(neuRaised(34, y, cw, ch, 18, uid, "sm"));
    // Sunken Circular Icon Socket on Left
    const icx = 62;
    const icy = y + ch / 2;
    b.push(neuCircleWell(icx, icy, 16, uid));
    const iconColor = n % 2 === 0 ? p.red : p.gold;
    b.push(icon(i, item.icon, icx - 9, icy - 9, 18, iconColor));
    b.push(txt(92, y + 31, fit(item.label, 15, cw - 112, 500), 15, p.textMain, { weight: 500 }));
    b.push(`</g>`);
  });

  return svg(W, h, b.join(""), c.about.title, c.motion);
}

// --- 3. TECH STACK BLOCK ---
function stack(ctx) {
  const { c, p, i } = ctx;
  let y = 96;
  let d = 0.1;
  const uid = "stack";
  const groups = [];

  for (const [gi, group] of c.stack.groups.entries()) {
    if (group.title) {
      const titleStr = group.title.toUpperCase();
      // Generous padding (+ letter-spacing compensation) so text NEVER overflows the sunken pill!
      const gw = Math.round(textWidth(titleStr, 11.5, 700) + titleStr.length * 0.8 + 44);
      const dotColor = gi % 2 === 0 ? p.red : p.gold;
      groups.push(
        `<g class="fade" style="animation-delay:${d.toFixed(2)}s">` +
          neuWell(34, y, gw, 26, 13, uid) +
          `<circle cx="48" cy="${y + 13}" r="3.5" fill="${dotColor}"/>` +
          txt(59, y + 17, titleStr, 11.5, p.textMain, { weight: 700, extra: ' letter-spacing="0.6"' }) +
          neuWell(34 + gw + 12, y + 11, W - 68 - gw - 12, 4, 2, uid) +
          `</g>`
      );
    }
    let x = 34;
    let cy = group.title ? y + 36 : y;
    for (const item of group.items) {
      const [, w] = neuChip(i, p, 0, 0, item.label, uid, { icon: item.icon });
      if (x + w > W - 34) {
        x = 34;
        cy += 48;
      }
      groups.push(neuChip(i, p, x, cy, item.label, uid, { icon: item.icon, delay: d })[0]);
      x += w + 12;
      d += 0.03;
    }
    y = cy + 40 + 24;
  }

  const h = y + 12;
  const b = [neuBoard(W, h, p, uid)];
  b.push(sectionHeader(34, 24, c.stack.title, "code", "STACK // 02", ctx, uid));
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
  Go: "brand:go",
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
  const h = 248;
  const d0 = 0.08 * index;
  const v = projectView(c, repo, index);
  const uid = `proj-${index}`;
  const b = [neuBoard(w, h, p, uid, 24)];

  // Top-Left Double-Ring Neumorphic Icon Badge (like the vertical cards at bottom of reference!)
  const icx = 50;
  const icy = 48;
  b.push(`<g class="pop" style="animation-delay:${d0.toFixed(2)}s">`);
  b.push(neuCircleWell(icx, icy, 24, uid));
  b.push(neuCircleDisc(icx, icy, 18, uid, "sm"));
  const iconColor = index % 2 === 0 ? p.red : p.gold;
  b.push(icon(i, v.icon, icx - 10, icy - 10, 20, iconColor));
  b.push(`</g>`);

  // Project Index Pill
  const idxText = `PROJEKT // 0${index + 1}`;
  const idxW = textWidth(idxText, 11, 700) + 24;
  b.push(neuWell(84, 35, idxW, 26, 13, uid));
  b.push(txt(84 + idxW / 2, 52, idxText, 11, p.textMuted, { weight: 700, anchor: "middle", extra: ' letter-spacing="0.6"' }));

  // Top-Right Raised External Link Button (No tri-color overlap!)
  b.push(neuCircleDisc(w - 44, 48, 18, uid, "sm"));
  b.push(icon(i, "arrow_outward", w - 52, 40, 16, p.textMain));

  // Repo Title
  const title = fit(v.title, 20, w - 56, 700);
  b.push(txt(28, 104, title, 20, p.textMain, { weight: 700, cls: "up", delay: d0 + 0.08 }));

  // Description inside Sunken Well
  b.push(neuWell(26, 116, w - 52, 56, 14, uid));
  wrap(v.text, 13.5, w - 76, 500, 2).forEach((line, n) => {
    b.push(txt(38, 139 + n * 19, line, 13.5, p.textMuted, { weight: 500, cls: "up", delay: d0 + 0.14 + n * 0.05 }));
  });

  // Bottom Tags
  let x = 26;
  v.tags.forEach((tag, n) => {
    const [g, cw] = neuChip(i, p, x, 188, tag, uid, { delay: d0 + 0.25 + n * 0.05, h: 32, size: 12.5, rx: 16 });
    if (x + cw < w - 95) {
      b.push(g);
      x += cw + 8;
    }
  });

  // Star Counter in Sunken Pill on Bottom Right
  const starStr = String(repo.stars);
  const sw = textWidth(starStr, 13, 700) + 42;
  const sx = w - 26 - sw;
  b.push(`<g class="pop" style="animation-delay:${(d0 + 0.35).toFixed(2)}s">`);
  b.push(neuWell(sx, 188, sw, 32, 16, uid));
  b.push(icon(i, "star", sx + 10, 196, 16, p.gold));
  b.push(txt(sx + 30, 209, starStr, 13, p.textMain, { weight: 700 }));
  b.push(`</g>`);

  return svg(w, h, b.join(""), v.title, c.motion);
}

// --- 5. STATS BLOCK ---
function stats(ctx) {
  const { c, d, p, i } = ctx;
  const s = c.stats;
  const uid = "stats";
  const langs = s.showLanguages ? d.languages : [];
  const total = langs.reduce((a, [, v]) => a + v, 0) || 1;
  const legend = [];
  let lx = 34;
  let row = 0;
  for (const [name, v] of langs) {
    const label = `${name} ${((100 * v) / total).toFixed(1)}%`.replace(".0%", "%");
    const lw = 24 + textWidth(label, 13, 600) + 18;
    if (lx + lw > W - 34) {
      lx = 34;
      row++;
    }
    legend.push([lx, row, label]);
    lx += lw;
  }

  const h = s.showLanguages && langs.length ? 430 + row * 30 : 330;
  const b = [neuBoard(W, h, p, uid)];
  b.push(sectionHeader(34, 24, s.title, "monitoring", "METRIKEN // 03", ctx, uid));

  // 4 Neumorphic Metric Tiles on Left
  const tiles = [
    ["star", d.stars, s.stars, p.gold],
    ["commit", d.contributions, s.contributions, p.red],
    ["book_2", d.repos, s.repos, p.gold],
    ["group", d.followers, s.followers, p.red],
  ];

  tiles.forEach(([ic, value, label, accentColor], n) => {
    const tx = 34 + (n % 2) * 192;
    const ty = 94 + Math.floor(n / 2) * 106;
    b.push(`<g class="up" style="animation-delay:${(0.1 + n * 0.07).toFixed(2)}s">`);
    b.push(neuRaised(tx, ty, 180, 94, 20, uid, "sm"));
    // Sunken circular icon well
    b.push(neuCircleWell(tx + 32, ty + 34, 18, uid));
    b.push(icon(i, ic, tx + 23, ty + 25, 18, accentColor));
    b.push(txt(tx + 58, ty + 42, String(value), 26, p.textMain, { weight: 700 }));
    b.push(txt(tx + 16, ty + 76, fit(label, 12.5, 150, 600), 12.5, p.textMuted, { weight: 600 }));
    b.push(`</g>`);
  });

  // Right Side 21-Day Contribution Calendar Matrix
  const rx = 434;
  b.push(txt(rx, 106, s.calendar, 13.5, p.textMain, { weight: 700, cls: "fade", delay: 0.1 }));
  const gap = 7;
  const cw = (W - 34 - rx - gap * 6) / 7;
  const ch = 42;

  [...(s.weekdays + "       ").slice(0, 7)].forEach((letter, n) => {
    b.push(txt(rx + n * (cw + gap) + cw / 2, 128, letter, 11.5, p.textSoft, { weight: 700, cls: "fade", delay: 0.15, anchor: "middle" }));
  });

  const peak = Math.max(1, ...d.days.flat().map((x) => x?.c ?? 0));
  d.days.forEach((wk, wi) => {
    wk.forEach((day, di) => {
      const x = rx + di * (cw + gap);
      const y = 138 + wi * (ch + 7);
      const delay = 0.18 + (wi * 7 + di) * 0.02;
      if (!day) {
        b.push(neuWell(x, y, cw, ch, 11, uid));
        return;
      }
      const lvl = day.c === 0 ? 0 : Math.min(4, 1 + Math.floor((3 * day.c) / peak + 0.5));
      let cell = "";
      if (lvl === 0) {
        // Inactive day: Sunken Neumorphic Socket
        cell += neuWell(x, y, cw, ch, 11, uid);
        cell += txt(x + cw / 2, y + ch / 2 + 5, String(day.day), 13, p.textSoft, { weight: 600, anchor: "middle" });
      } else {
        // Active day: Raised Neumorphic Button with vibrant indicator dot
        cell += neuRaised(x, y, cw, ch, 11, uid, "sm");
        const dotColor = lvl >= 3 ? p.red : p.gold;
        cell += `<circle cx="${(x + cw / 2).toFixed(1)}" cy="${(y + ch - 7).toFixed(1)}" r="2.5" fill="${dotColor}"/>`;
        cell += txt(x + cw / 2, y + ch / 2 + 3, String(day.day), 13, p.textMain, { weight: 700, anchor: "middle" });
      }
      if (day.today) {
        cell += `<rect x="${(x - 1).toFixed(1)}" y="${(y - 1).toFixed(1)}" width="${(cw + 2).toFixed(1)}" height="${(ch + 2).toFixed(1)}" rx="12" fill="none" stroke="${p.red}" stroke-width="2"/>`;
      }
      b.push(`<g class="pop" style="animation-delay:${delay.toFixed(3)}s">${cell}</g>`);
    });
  });

  // Languages Progress Track (Sunken Neumorphic Groove + Vibrant Fill + Tactile Knobs)
  if (s.showLanguages && langs.length) {
    const ly = 334;
    b.push(txt(34, ly, s.languages, 13.5, p.textMain, { weight: 700, cls: "fade", delay: 0.3 }));
    const barColors = [p.red, p.gold, p.purple, p.blue, p.green, "#F97316", "#64748B"];
    const bw = W - 68;
    // Sunken Track
    b.push(neuWell(34, ly + 12, bw, 20, 10, uid));
    b.push(`<clipPath id="lang-clip"><rect x="37" y="${ly + 15}" width="${bw - 6}" height="14" rx="7"/></clipPath>`);

    let sx = 37;
    const segs = langs.map(([, v], n) => {
      const sw = Math.max(8, ((bw - 6) * v) / total);
      const r = `<rect x="${sx.toFixed(1)}" y="${ly + 15}" width="${(sw + 1).toFixed(1)}" height="14" fill="${barColors[n % barColors.length]}"/>`;
      sx += sw;
      return r;
    });
    b.push(`<g clip-path="url(#lang-clip)"><g class="grow" style="animation-delay:.38s">${segs.join("")}</g></g>`);

    legend.forEach(([lx2, lrow, label], n) => {
      const ly2 = ly + 58 + lrow * 30;
      const col = barColors[n % barColors.length];
      b.push(
        pop(
          neuCircleWell(lx2 + 8, ly2 - 5, 8, uid) +
            `<circle cx="${lx2 + 8}" cy="${ly2 - 5}" r="4.5" fill="${col}"/>` +
            txt(lx2 + 22, ly2, label, 13, p.textMain, { weight: 600 }),
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
  const h = 232;
  const uid = "streak";
  const b = [neuBoard(W, h, p, uid)];
  b.push(sectionHeader(34, 24, s.title, "local_fire_department", "SERIE // 04", ctx, uid));

  const tw = (W - 68 - 20) / 2;
  const tiles = [
    [d.streak.current, s.current, "local_fire_department", p.red],
    [d.streak.longest, s.longest, "trophy", p.gold],
  ];

  tiles.forEach(([value, label, ic, accentColor], n) => {
    const tx = 34 + n * (tw + 20);
    const ty = 94;
    b.push(`<g class="up" style="animation-delay:${(0.12 + n * 0.1).toFixed(2)}s">`);
    // Double-layered Neumorphic Card (Sunken Outer Well + Raised Inner Plateau)
    b.push(neuDoublePill(tx, ty, tw, 108, 24, uid, 6));

    // Double-ring Circular Dial on Left
    const icx = tx + 48;
    const icy = ty + 54;
    b.push(neuCircleWell(icx, icy, 26, uid));
    b.push(neuCircleDisc(icx, icy, 19, uid, "sm"));
    b.push(icon(i, ic, icx - 11, icy - 11, 22, accentColor));

    const num = String(value);
    b.push(txt(tx + 88, ty + 58, num, 36, p.textMain, { weight: 700 }));
    b.push(txt(tx + 94 + textWidth(num, 36, 700), ty + 58, s.days, 14.5, accentColor, { weight: 700 }));
    b.push(txt(tx + 88, ty + 82, fit(label, 13.5, tw - 104, 600), 13.5, p.textMuted, { weight: 600 }));
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
  const h = 54;
  const w = 52 + textWidth(label, 14.5, 700) + 22;
  const delay = n * 0.06;
  const uid = `soc-${n}`;
  const accent = n % 2 === 0 ? p.red : p.gold;

  // Double-layered Neumorphic Pill (Sunken Well + Raised Button + Sunken Icon Disc)
  let body = neuDoublePill(4, 4, w - 8, h - 8, 23, uid, 4);
  body += neuCircleWell(28, h / 2, 13, uid);
  body += icon(i, item.icon, 20, h / 2 - 8, 16, accent);
  body += txt(48, h / 2 + 5, label, 14.5, p.textMain, { weight: 700 });
  return { body: neuDefs(p, uid) + `<rect width="${w}" height="${h}" rx="18" fill="${p.surface}"/>` + pop(body, delay), w, h, title: label };
}

function buttonPiece({ p, i }, btn, n) {
  const h = 60;
  const size = 15;
  const iw = btn.icon ? 34 : 0;
  const w = 48 + iw + textWidth(btn.label, size, 700);
  const isFilled = btn.style === "filled";
  const uid = `btn-${n}`;
  const accentColor = isFilled ? p.red : p.gold;

  let body = neuDefs(p, uid);
  body += `<rect width="${w.toFixed(1)}" height="${h}" rx="22" fill="${p.surface}"/>`;
  body += neuDoublePill(4, 4, w - 8, h - 8, 26, uid, 5);
  if (btn.icon) {
    body += neuCircleWell(31, h / 2, 14, uid);
    body += icon(i, btn.icon, 22, h / 2 - 9, 18, accentColor);
  }
  body += txt(24 + iw, h / 2 + 5.5, btn.label, size, p.textMain, { weight: 700 });
  return { body: pop(body, n * 0.08), w, h, title: btn.label };
}

const GAP = 8;
const CAP = 24;

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
  const h = Math.max(...pieces.map((x) => x.h)) + 20;
  const cap = (W - pieces.reduce((a, x) => a + x.w + GAP, 0)) / 2;
  files[`${prefix}-l`] = svg(
    cap,
    h,
    neuDefs(p, `${prefix}-l`) +
      `<rect x="2" y="2" width="${(cap + 30).toFixed(1)}" height="${h - 4}" rx="22" fill="${p.surface}"/>` +
      neuWell(16, h / 2 - 8, Math.max(24, cap - 24), 16, 8, `${prefix}-l`),
    "",
    c.motion
  );
  files[`${prefix}-r`] = svg(
    cap,
    h,
    neuDefs(p, `${prefix}-r`) +
      `<rect x="-32" y="2" width="${(cap + 30).toFixed(1)}" height="${h - 4}" rx="22" fill="${p.surface}"/>` +
      neuWell(8, h / 2 - 8, Math.max(24, cap - 24), 16, 8, `${prefix}-r`),
    "",
    c.motion
  );
  pieces.forEach((x, n) => {
    const w = x.w + GAP;
    files[`${prefix}-${n + 1}`] = svg(
      w,
      h,
      `<rect y="2" width="${w + 1}" height="${h - 4}" fill="${p.surface}"/>` +
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

// --- 8. NEUMORPHIC WAVE DIVIDER ---
function wave({ c, p }) {
  const h = 48;
  const uid = "wave";
  const pts = [];
  const amp = 5;
  const len = 48;
  for (let x = 0; x <= W + len * 2; x += 4) {
    pts.push(`${x} ${(h / 2 + amp * Math.sin((2 * Math.PI * x) / len)).toFixed(1)}`);
  }

  const b = [
    neuBoard(W, h, p, uid, 22),
    neuWell(24, 12, W - 48, 24, 12, uid),
    `<clipPath id="w-clip"><rect x="26" y="14" width="${W - 52}" height="20" rx="10"/></clipPath>`,
    `<g clip-path="url(#w-clip)">`,
    `<path class="wave" d="M${pts.join(" L")}" fill="none" stroke="url(#acc-${uid})" stroke-width="3.5" stroke-linecap="round"/>`,
    `</g>`,
  ];
  return svg(W, h, b.join(""), "divider", c.motion);
}

function credit({ p }) {
  const label = "NEUMORPHIC SOFT UI // DEUTSCHE AUSGABE";
  const size = 11;
  const w = Math.round(textWidth(label, size, 700) + label.length * 0.8 + 44);
  return svg(
    w,
    32,
    neuDefs(p, "cred") +
      `<rect width="${w}" height="32" rx="16" fill="${p.surface}"/>` +
      neuWell(4, 4, w - 8, 24, 12, "cred") +
      txt(w / 2, 20, label, size, p.textMuted, { weight: 700, anchor: "middle", extra: ' letter-spacing="0.8"' }),
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

// --- GitHub GraphQL & REST API Data Fetcher ---
const NOISE = new Set(["Inno Setup", "Batchfile", "PowerShell", "VBScript", "Shell", "Makefile", "Dockerfile"]);
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

async function graphql(query, variables = {}) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "User-Agent": "expressive-profile-neumorphism" },
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

async function fetchRestFallback(login, fallback) {
  try {
    const h = { Accept: "application/vnd.github+json", "User-Agent": "expressive-profile-neumorphism" };
    const [uRes, rRes, eRes] = await Promise.all([
      fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, { headers: h }),
      fetch(`https://api.github.com/users/${encodeURIComponent(login)}/repos?per_page=100&type=owner&sort=pushed`, { headers: h }),
      fetch(`https://api.github.com/users/${encodeURIComponent(login)}/events/public?per_page=100`, { headers: h }),
    ]);
    if (!uRes.ok || !rRes.ok) return fallback;
    const user = await uRes.json();
    const repos = await rRes.json();
    const events = eRes.ok ? await eRes.json() : [];

    const all = repos.map((r) => ({
      name: r.name,
      url: r.html_url,
      text: (r.description || "").trim(),
      fork: r.fork,
      stars: r.stargazers_count,
      language: r.language,
      topics: r.topics ?? [],
    }));
    const langs = {};
    for (const r of repos) {
      if (!r.fork && r.language && !NOISE.has(r.language)) {
        langs[r.language] = (langs[r.language] ?? 0) + Math.max(1, r.size);
      }
    }
    const counts = {};
    for (const e of events) {
      const key = (e.created_at || "").slice(0, 10);
      if (!key) continue;
      let n = 0;
      if (e.type === "PushEvent") n = e.payload?.distinct_size ?? e.payload?.size ?? 1;
      else if (["PullRequestEvent", "IssuesEvent"].includes(e.type) && e.payload?.action === "opened") n = 1;
      else if (["CreateEvent", "PullRequestReviewEvent"].includes(e.type)) n = 1;
      counts[key] = (counts[key] ?? 0) + n;
    }
    const now = new Date();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() - 14);
    const days = [];
    for (let w = 0; w < 3; w++) {
      const row = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        row.push(date > now ? null : { c: counts[iso(date)] ?? 0, day: date.getDate(), today: iso(date) === iso(now) });
      }
      days.push(row);
    }
    const series = [];
    for (let back = 89; back >= 0; back--) {
      const d = new Date(now);
      d.setDate(now.getDate() - back);
      series.push(counts[iso(d)] ?? 0);
    }
    const own = all.filter((r) => !r.fork);
    const totalEvents = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      stars: own.reduce((a, r) => a + r.stars, 0),
      contributions: Math.max(totalEvents, fallback?.contributions ?? 0),
      repos: user.public_repos,
      followers: user.followers,
      languages: Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 7),
      days,
      streak: streakOf(series),
      pins: own.slice(0, 4),
      all,
    };
  } catch {
    return fallback;
  }
}

async function fetchLiveGitHubData(login, fallback) {
  if (!login || login.includes("[") || login.includes(" ")) {
    return fallback;
  }
  if (!token) {
    return fetchRestFallback(login, fallback);
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
    console.warn("Using cached/fallback data:", e.message);
    return fallback;
  }
}

async function fetchAvatar(login, fallbackAvatar = null) {
  if (!login || login.includes("[") || login.includes(" ")) return fallbackAvatar;
  const urls = [
    `https://avatars.githubusercontent.com/${login}?s=320`,
    `https://github.com/${login}.png?size=320`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "expressive-profile" } });
      if (!r.ok) continue;
      const type = r.headers.get("content-type") || "image/png";
      return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
    } catch {
      // try next
    }
  }
  return fallbackAvatar;
}

async function main() {
  const config = JSON.parse(readFileSync("profile.json", "utf8"));
  const icons = JSON.parse(readFileSync(".profile/icons.json", "utf8"));
  const cached = existsSync(".profile/data.json") ? JSON.parse(readFileSync(".profile/data.json", "utf8")) : null;
  const data = await fetchLiveGitHubData(config.login, cached);
  const ava = await fetchAvatar(config.login, cached?.avatar ?? null);
  if (ava) data.avatar = ava;

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
  console.log("Rendered", Object.keys(files).length, "Pure Neumorphism SVGs successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

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

// --- Neumorphism Theme System (Soft Extruded & Inset Surfaces with German Accents) ---
function getTheme(dark) {
  if (dark) {
    return {
      dark: true,
      bg: "#181A1F",
      panelBg: "#181A1F",
      shLight: "#23262D",      // Top-left highlight shadow
      shDark: "#0D0E11",       // Bottom-right deep shadow
      shLightSubtle: "#1F2128",
      shDarkSubtle: "#101114",
      insetTop: "#0E0F12",
      insetBottom: "#22252C",
      borderOuter: "rgba(255, 255, 255, 0.04)",
      borderInner: "rgba(0, 0, 0, 0.4)",
      textMain: "#E6E9EE",
      textMuted: "#8E94A0",
      textSoft: "#6B7280",
      red: "#FF5252",
      redGlow: "rgba(255, 82, 82, 0.28)",
      gold: "#FFD152",
      goldGlow: "rgba(255, 209, 82, 0.25)",
      accentBlue: "#60A5FA",
      concaveGradient: ["#17191E", "#1A1C21"],
      convexGradient: ["#1B1D23", "#16171C"],
    };
  }
  return {
    dark: false,
    bg: "#E3E7ED",
    panelBg: "#E3E7ED",
    shLight: "#FFFFFF",        // Top-left soft highlight
    shDark: "#BAC1CC",         // Bottom-right diffuse shadow
    shLightSubtle: "#FFFFFF",
    shDarkSubtle: "#C6CDD8",
    insetTop: "#B4BCC8",
    insetBottom: "#FFFFFF",
    borderOuter: "rgba(255, 255, 255, 0.7)",
    borderInner: "rgba(160, 170, 185, 0.3)",
    textMain: "#22262E",
    textMuted: "#5C6474",
    textSoft: "#7E889B",
    red: "#E53935",
    redGlow: "rgba(229, 57, 53, 0.25)",
    gold: "#D99B00",
    goldGlow: "rgba(217, 155, 0, 0.25)",
    accentBlue: "#2563EB",
    concaveGradient: ["#DADFE7", "#E7EBF1"],
    convexGradient: ["#E7EBF1", "#DADFE7"],
  };
}

const CSS = `
.up{animation:up .75s cubic-bezier(.16,1,.3,1) both}
.pop{transform-box:fill-box;transform-origin:center;animation:pop .55s cubic-bezier(.34,1.56,.64,1) both}
.fade{animation:fade .8s ease both}
.spin{transform-box:fill-box;transform-origin:center;animation:spin 36s linear infinite}
.bob{transform-box:fill-box;transform-origin:center;animation:bob 6s ease-in-out infinite}
.pulse{transform-box:fill-box;transform-origin:center;animation:pulse 4s ease-in-out infinite}
.grow{transform-box:fill-box;transform-origin:left center;animation:grow 1s cubic-bezier(.2,0,0,1) both}
.wave{animation:wave 3s linear infinite}
@keyframes up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes pop{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes pulse{0%,100%{opacity:.85}50%{opacity:1}}
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

// --- Neumorphic Filters & Shapes ---
function neumorphicFilterDefs(p, uid) {
  const dx = 6;
  const dy = 6;
  const dev = 7;
  return `
    <defs>
      <!-- Extruded Card Shadow Filter -->
      <filter id="neu-ext-${uid}" x="-20%" y="-20%" width="150%" height="150%">
        <feDropShadow dx="-${dx}" dy="-${dy}" stdDeviation="${dev}" flood-color="${p.shLight}" flood-opacity="${p.dark ? "0.6" : "0.9"}"/>
        <feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${dev + 1}" flood-color="${p.shDark}" flood-opacity="${p.dark ? "0.8" : "0.6"}"/>
      </filter>
      <!-- Small Element Extruded Filter (Chips & Buttons) -->
      <filter id="neu-sm-${uid}" x="-30%" y="-30%" width="170%" height="170%">
        <feDropShadow dx="-3" dy="-3" stdDeviation="3.5" flood-color="${p.shLight}" flood-opacity="${p.dark ? "0.65" : "0.95"}"/>
        <feDropShadow dx="3" dy="3" stdDeviation="4" flood-color="${p.shDark}" flood-opacity="${p.dark ? "0.75" : "0.55"}"/>
      </filter>
      <!-- Pressed / Inset Gradient Simulators -->
      <linearGradient id="neu-pressed-${uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${p.insetTop}"/>
        <stop offset="100%" stop-color="${p.insetBottom}"/>
      </linearGradient>
      <!-- Subtle Surface Convex Gradient -->
      <linearGradient id="neu-convex-${uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${p.convexGradient[0]}"/>
        <stop offset="100%" stop-color="${p.convexGradient[1]}"/>
      </linearGradient>
      <!-- Glow Gradients -->
      <radialGradient id="glow-red-${uid}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${p.red}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${p.red}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glow-gold-${uid}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${p.gold}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${p.gold}" stop-opacity="0"/>
      </radialGradient>
    </defs>
  `;
}

// Extruded Neumorphic Panel (Card)
function neuPanel(w, h, p, uid, opts = {}) {
  const rx = opts.rx ?? 24;
  const pad = opts.margin ?? 14;
  const pw = w - pad * 2;
  const ph = h - pad * 2;
  const defs = neumorphicFilterDefs(p, uid);

  const body = [
    defs,
    // Soft extruded panel with dual light/dark drop-shadow
    `<rect x="${pad}" y="${pad}" width="${pw}" height="${ph}" rx="${rx}" fill="url(#neu-convex-${uid})" filter="url(#neu-ext-${uid})"/>`,
    // Subtle outer perimeter rim
    `<rect x="${pad + 0.5}" y="${pad + 0.5}" width="${pw - 1}" height="${ph - 1}" rx="${rx}" fill="none" stroke="${p.borderOuter}" stroke-width="1.2"/>`,
    // German Tri-color soft status dot/pills in top-right (inside sunken well)
    neuWell(pad + pw - 68, pad + 12, 54, 16, 8, p, uid),
    `<circle cx="${pad + pw - 55}" cy="${pad + 20}" r="3.5" fill="${p.dark ? "#383C47" : "#111115"}"/>`,
    `<circle cx="${pad + pw - 41}" cy="${pad + 20}" r="3.5" fill="${p.red}"/>`,
    `<circle cx="${pad + pw - 27}" cy="${pad + 20}" r="3.5" fill="${p.gold}"/>`,
  ].join("");

  return { svg: body, pw, ph, pad };
}

// Neumorphic Inset / Sunken Well (For meters, badges, and counters)
function neuWell(x, y, w, h, rx, p, uid, fill = "url(#neu-pressed-" + uid + ")") {
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`,
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="${rx}" fill="none" stroke="${p.borderInner}" stroke-width="1.2"/>`,
  ].join("");
}

// Section Header with Soft Embossed Icon
function sectionHeader(x, y, label, ic, indexCode, { p, i }, uid, delay = 0) {
  const b = [];
  const iconBoxSize = 40;
  // Soft raised icon button
  b.push(`<g class="pop" style="animation-delay:${delay.toFixed(2)}s">`);
  b.push(`<rect x="${x}" y="${y}" width="${iconBoxSize}" height="${iconBoxSize}" rx="12" fill="url(#neu-convex-${uid})" filter="url(#neu-sm-${uid})"/>`);
  b.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${iconBoxSize - 1}" height="${iconBoxSize - 1}" rx="12" fill="none" stroke="${p.borderOuter}" stroke-width="1"/>`);
  b.push(icon(i, ic, x + 10, y + 10, 20, p.red));
  b.push(`</g>`);

  // Section Title
  b.push(txt(x + 52, y + 27, fit(label, 20, W - x - 200, 600), 20, p.textMain, { weight: 600, cls: "up", delay: delay + 0.05 }));

  // Sunken Neumorphic Index Badge on right
  const tagW = textWidth(indexCode, 11.5, 600) + 20;
  const tx = W - 36 - tagW;
  b.push(`<g class="fade" style="animation-delay:${(delay + 0.1).toFixed(2)}s">`);
  b.push(neuWell(tx, y + 8, tagW, 24, 8, p, uid));
  b.push(txt(tx + tagW / 2, y + 24, indexCode, 11.5, p.textMuted, { weight: 600, anchor: "middle", extra: ' letter-spacing="0.5"' }));
  b.push(`</g>`);

  // Neumorphic divider line (soft double groove: dark top, highlight bottom)
  b.push(`<line x1="${x}" y1="${y + 50}" x2="${W - 36}" y2="${y + 50}" stroke="${p.shDark}" stroke-width="1.2" opacity="0.6"/>`);
  b.push(`<line x1="${x}" y1="${y + 51.2}" x2="${W - 36}" y2="${y + 51.2}" stroke="${p.shLight}" stroke-width="1.2" opacity="0.8"/>`);

  return b.join("");
}

// Neumorphic Chip / Pill Button
function neuChip(icons, p, x, y, label, uid, o = {}) {
  const h = o.h ?? 36;
  const size = o.size ?? 13.5;
  const pad = 14;
  const iw = o.icon ? 18 : 0;
  const gap = o.icon ? 8 : 0;
  const w = pad * 2 + iw + gap + textWidth(label, size, 500);
  const rx = o.rx ?? 14;

  let iconColor = o.iconColor ?? (o.accent === "red" ? p.red : o.accent === "gold" ? p.gold : p.textMuted);
  let fg = o.accent ? p.textMain : p.textMain;

  let body = "";
  if (o.pressed) {
    body += neuWell(x, y, w, h, rx, p, uid);
  } else {
    body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="url(#neu-convex-${uid})" filter="url(#neu-sm-${uid})"/>`;
    body += `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="${rx}" fill="none" stroke="${p.borderOuter}" stroke-width="1"/>`;
  }
  if (o.accent) {
    const dotColor = o.accent === "red" ? p.red : p.gold;
    body += `<circle cx="${x + 12}" cy="${y + h / 2}" r="3" fill="${dotColor}"/>`;
  }
  const extraOffset = o.accent ? 6 : 0;
  if (o.icon) body += icon(icons, o.icon, x + pad + extraOffset, y + (h - 18) / 2, 18, iconColor);
  body += txt(x + pad + iw + gap + extraOffset, y + h / 2 + size * 0.36, label, size, fg, { weight: 500 });
  return [pop(body, o.delay ?? 0), w];
}

// --- 1. HERO BLOCK ---
function hero(ctx, avatar) {
  const { c, p, i } = ctx;
  const h = 320;
  const uid = "hero";
  const shell = neuPanel(W, h, p, uid);
  const b = [shell.svg];

  // Soft Ambient Glow behind Avatar
  b.push(`<circle cx="132" cy="160" r="105" fill="url(#glow-gold-${uid})" opacity="0.6" class="pulse"/>`);

  // Avatar Neumorphic Frame (Double-ring extruded & sunken socket)
  const ax = 42;
  const ay = 68;
  const asize = 180;
  const arx = 36;
  // Outer soft elevated mound
  b.push(`<rect x="${ax - 6}" y="${ay - 6}" width="${asize + 12}" height="${asize + 12}" rx="${arx + 4}" fill="url(#neu-convex-${uid})" filter="url(#neu-ext-${uid})"/>`);
  // Sunken socket
  b.push(neuWell(ax - 2, ay - 2, asize + 4, asize + 4, arx, p, uid));

  // Avatar Image with Rounded Clip
  b.push(`<clipPath id="ava-clip"><rect x="${ax}" y="${ay}" width="${asize}" height="${asize}" rx="${arx - 2}"/></clipPath>`);
  if (avatar) {
    b.push(`<g class="fade"><image href="${avatar}" x="${ax}" y="${ay}" width="${asize}" height="${asize}" clip-path="url(#ava-clip)" preserveAspectRatio="xMidYMid slice"/></g>`);
  } else {
    b.push(`<g clip-path="url(#ava-clip)">`);
    b.push(`<rect x="${ax}" y="${ay}" width="${asize}" height="${asize}" fill="${p.panelBg}"/>`);
    b.push(icon(i, "person", ax + 40, ay + 36, 100, p.textMuted));
    b.push(`</g>`);
  }
  // Soft rim highlight inside avatar
  b.push(`<rect x="${ax}" y="${ay}" width="${asize}" height="${asize}" rx="${arx - 2}" fill="none" stroke="${p.borderOuter}" stroke-width="1.5"/>`);

  // Hero Text Content
  const tx = 258;
  // Greeting Pill
  const greetText = c.hero.greeting;
  const gw = textWidth(greetText, 13, 500) + 28;
  b.push(`<g class="up" style="animation-delay:0.08s">`);
  b.push(neuWell(tx, 66, gw, 26, 13, p, uid));
  b.push(`<circle cx="${tx + 12}" cy="79" r="3.5" fill="${p.red}"/>`);
  b.push(txt(tx + 22, 83, greetText, 13, p.textMuted, { weight: 500 }));
  b.push(`</g>`);

  // Main Name
  const name = c.hero.name || c.login;
  const room = W - tx - 80;
  const size = Math.min(44, room / Math.max(1, textWidth(name, 1, 700)));
  b.push(pop(txt(tx, 134, name, size, p.textMain, { weight: 700 }), 0.16, "up"));

  // Subtitle (Wrapped inside soft sunken text bar)
  const lines = wrap(c.hero.subtitle, 15, W - tx - 60, 400, 2);
  const subH = lines.length * 22 + 16;
  b.push(`<g class="up" style="animation-delay:0.25s">`);
  b.push(neuWell(tx, 150, W - tx - 44, subH, 12, p, uid));
  lines.forEach((line, n) => {
    b.push(txt(tx + 16, 172 + n * 22, line, 15, p.textMuted, { weight: 400 }));
  });
  b.push(`</g>`);

  // Hero Chips Row
  let cx2 = tx;
  const cy2 = 236;
  c.hero.chips.forEach((item, n) => {
    const accent = n === 0 ? "gold" : n === 1 ? "red" : undefined;
    const [g, cw] = neuChip(i, p, cx2, cy2, item.label, uid, { icon: item.icon, delay: 0.35 + n * 0.08, accent });
    if (cx2 + cw > W - 32) return;
    b.push(g);
    cx2 += cw + 10;
  });

  return svg(W, h, b.join(""), `${c.hero.greeting} ${name}`, c.motion);
}

// --- 2. ABOUT BLOCK ---
function about(ctx) {
  const { c, p, i } = ctx;
  const row = 58;
  const h = 104 + row * c.about.items.length;
  const uid = "about";
  const shell = neuPanel(W, h, p, uid);
  const b = [shell.svg];
  b.push(sectionHeader(36, 26, c.about.title, "person", "PROFIL // 01", ctx, uid));

  c.about.items.forEach((item, n) => {
    const y = 88 + n * row;
    const cw = W - 72;
    const ch = row - 12;

    b.push(`<g class="up" style="animation-delay:${(0.12 + n * 0.08).toFixed(2)}s">`);
    // Soft extruded item row
    b.push(`<rect x="36" y="${y}" width="${cw}" height="${ch}" rx="16" fill="url(#neu-convex-${uid})" filter="url(#neu-sm-${uid})"/>`);
    b.push(`<rect x="36.5" y="${y + 0.5}" width="${cw - 1}" height="${ch - 1}" rx="16" fill="none" stroke="${p.borderOuter}" stroke-width="1"/>`);

    // Inset circular icon pocket
    b.push(neuWell(48, y + 8, 30, 30, 15, p, uid));
    const iconColor = n % 2 === 0 ? p.red : p.gold;
    b.push(icon(i, item.icon, 54, y + 14, 18, iconColor));
    b.push(txt(90, y + 29, fit(item.label, 15.5, cw - 110, 500), 15.5, p.textMain, { weight: 500 }));
    b.push(`</g>`);
  });

  return svg(W, h, b.join(""), c.about.title, c.motion);
}

// --- 3. TECH STACK BLOCK ---
function stack(ctx) {
  const { c, p, i } = ctx;
  let y = 90;
  let d = 0.1;
  const uid = "stack";
  const groups = [];

  for (const [gi, group] of c.stack.groups.entries()) {
    if (group.title) {
      const gw = textWidth(group.title.toUpperCase(), 11.5, 600) + 20;
      const dotColor = gi % 2 === 0 ? p.gold : p.red;
      groups.push(
        `<g class="fade" style="animation-delay:${d.toFixed(2)}s">` +
          neuWell(36, y + 2, gw, 22, 11, p, uid) +
          `<circle cx="48" cy="${y + 13}" r="3" fill="${dotColor}"/>` +
          txt(56, y + 17, group.title.toUpperCase(), 11.5, p.textMuted, { weight: 600, extra: ' letter-spacing="0.6"' }) +
          `<line x1="${(36 + gw + 10).toFixed(1)}" y1="${y + 13}" x2="${W - 40}" y2="${y + 13}" stroke="${p.shDark}" stroke-width="1" opacity="0.4"/>` +
          `<line x1="${(36 + gw + 10).toFixed(1)}" y1="${y + 14.2}" x2="${W - 40}" y2="${y + 14.2}" stroke="${p.shLight}" stroke-width="1" opacity="0.6"/>` +
          `</g>`
      );
    }
    let x = 36;
    let cy = group.title ? y + 34 : y;
    for (const item of group.items) {
      const [, w] = neuChip(i, p, 0, 0, item.label, uid, { icon: item.icon });
      if (x + w > W - 36) {
        x = 36;
        cy += 46;
      }
      groups.push(neuChip(i, p, x, cy, item.label, uid, { icon: item.icon, delay: d })[0]);
      x += w + 10;
      d += 0.035;
    }
    y = cy + 38 + 24;
  }

  const h = y + 10;
  const shell = neuPanel(W, h, p, uid);
  const b = [shell.svg];
  b.push(sectionHeader(36, 26, c.stack.title, "code", "STACK // 02", ctx, uid));
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
  const h = 240;
  const d0 = 0.08 * index;
  const v = projectView(c, repo, index);
  const uid = `proj-${index}`;
  const shell = neuPanel(w, h, p, uid, { rx: 20, margin: 10 });
  const b = [shell.svg];

  // Elevated Icon Pocket in Top-Left
  b.push(`<g class="pop" style="animation-delay:${d0.toFixed(2)}s">`);
  b.push(`<rect x="26" y="24" width="44" height="44" rx="14" fill="url(#neu-convex-${uid})" filter="url(#neu-sm-${uid})"/>`);
  b.push(`<rect x="26.5" y="24.5" width="43" height="43" rx="14" fill="none" stroke="${p.borderOuter}" stroke-width="1"/>`);
  const iconColor = index % 2 === 0 ? p.gold : p.red;
  b.push(icon(i, v.icon, 36, 34, 24, iconColor));
  b.push(`</g>`);

  // Sunken External Link Indicator in Top-Right
  b.push(neuWell(w - 56, 26, 32, 32, 16, p, uid));
  b.push(icon(i, "arrow_outward", w - 48, 34, 16, p.textMuted));

  // Index Tag
  b.push(txt(82, 43, `PROJEKT // 0${index + 1}`, 11, p.textSoft, { weight: 600, extra: ' letter-spacing="0.5"' }));

  // Repo Title
  const title = fit(v.title, 21, w - 52, 600);
  b.push(txt(26, 102, title, 21, p.textMain, { weight: 600, cls: "up", delay: d0 + 0.08 }));

  // Description Lines (Enclosed in a soft Sunken Text Pocket)
  wrap(v.text, 14, w - 52, 400, 2).forEach((line, n) => {
    b.push(txt(26, 128 + n * 20, line, 14, p.textMuted, { weight: 400, cls: "up", delay: d0 + 0.14 + n * 0.05 }));
  });

  // Divider Line
  b.push(`<line x1="26" y1="174" x2="${w - 26}" y2="174" stroke="${p.shDark}" stroke-width="1" opacity="0.4"/>`);
  b.push(`<line x1="26" y1="175.2" x2="${w - 26}" y2="175.2" stroke="${p.shLight}" stroke-width="1" opacity="0.6"/>`);

  // Tags
  let x = 26;
  v.tags.forEach((tag, n) => {
    const [g, cw] = neuChip(i, p, x, 186, tag, uid, { delay: d0 + 0.25 + n * 0.05, h: 28, size: 12, rx: 12 });
    if (x + cw < w - 85) {
      b.push(g);
      x += cw + 8;
    }
  });

  // Star Badge (Sunken Pill on Bottom Right)
  const starStr = String(repo.stars);
  const sw = textWidth(starStr, 13, 600) + 36;
  const sx = w - 24 - sw;
  b.push(`<g class="pop" style="animation-delay:${(d0 + 0.35).toFixed(2)}s">`);
  b.push(neuWell(sx, 186, sw, 28, 14, p, uid));
  b.push(icon(i, "star", sx + 8, 192, 16, p.gold));
  b.push(txt(sx + 28, 205, starStr, 13, p.textMain, { weight: 600 }));
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
  let lx = 36;
  let row = 0;
  for (const [name, v] of langs) {
    const label = `${name} ${((100 * v) / total).toFixed(1)}%`.replace(".0%", "%");
    const lw = 18 + textWidth(label, 13, 500) + 16;
    if (lx + lw > W - 36) {
      lx = 36;
      row++;
    }
    legend.push([lx, row, label]);
    lx += lw;
  }

  const h = s.showLanguages && langs.length ? 420 + row * 28 : 324;
  const shell = neuPanel(W, h, p, uid);
  const b = [shell.svg];
  b.push(sectionHeader(36, 26, s.title, "monitoring", "METRIKEN // 03", ctx, uid));

  // 4 Neumorphic Metric Tiles on Left
  const tiles = [
    ["star", d.stars, s.stars, p.gold],
    ["commit", d.contributions, s.contributions, p.red],
    ["book_2", d.repos, s.repos, p.gold],
    ["group", d.followers, s.followers, p.red],
  ];

  tiles.forEach(([ic, value, label, accentColor], n) => {
    const tx = 36 + (n % 2) * 192;
    const ty = 88 + Math.floor(n / 2) * 106;
    b.push(`<g class="up" style="animation-delay:${(0.1 + n * 0.07).toFixed(2)}s">`);
    // Extruded small panel
    b.push(`<rect x="${tx}" y="${ty}" width="180" height="92" rx="18" fill="url(#neu-convex-${uid})" filter="url(#neu-sm-${uid})"/>`);
    b.push(`<rect x="${tx + 0.5}" y="${ty + 0.5}" width="179" height="91" rx="18" fill="none" stroke="${p.borderOuter}" stroke-width="1"/>`);
    // Inset icon well
    b.push(neuWell(tx + 14, ty + 14, 32, 32, 12, p, uid));
    b.push(icon(i, ic, tx + 21, ty + 21, 18, accentColor));
    b.push(txt(tx + 56, ty + 40, String(value), 26, p.textMain, { weight: 700 }));
    b.push(txt(tx + 14, ty + 74, fit(label, 12, 152, 500), 12, p.textMuted, { weight: 500 }));
    b.push(`</g>`);
  });

  // Right Side 21-Day Contribution Calendar Matrix
  const rx = 436;
  b.push(txt(rx, 102, s.calendar, 13, p.textMain, { weight: 600, cls: "fade", delay: 0.1 }));
  const gap = 6;
  const cw = (W - 40 - rx - gap * 6) / 7;
  const ch = 42;

  [...(s.weekdays + "       ").slice(0, 7)].forEach((letter, n) => {
    b.push(txt(rx + n * (cw + gap) + cw / 2, 124, letter, 11.5, p.textSoft, { weight: 600, cls: "fade", delay: 0.15, anchor: "middle" }));
  });

  const peak = Math.max(1, ...d.days.flat().map((x) => x?.c ?? 0));
  d.days.forEach((wk, wi) => {
    wk.forEach((day, di) => {
      const x = rx + di * (cw + gap);
      const y = 134 + wi * (ch + 6);
      const delay = 0.18 + (wi * 7 + di) * 0.02;
      if (!day) {
        b.push(neuWell(x, y, cw, ch, 10, p, uid));
        return;
      }
      const lvl = day.c === 0 ? 0 : Math.min(4, 1 + Math.floor((3 * day.c) / peak + 0.5));
      const colors = [
        p.panelBg,
        p.dark ? "#2D3426" : "#D4E5C9",
        p.dark ? "#4D6335" : "#A6D68E",
        p.dark ? "#709B45" : "#72BF48",
        p.dark ? "#92CD54" : "#43A047",
      ];
      const fg = lvl === 0 ? p.textMuted : p.dark ? "#FFFFFF" : "#1B2E15";

      let cell = "";
      if (lvl === 0) {
        cell += neuWell(x, y, cw, ch, 10, p, uid);
      } else {
        cell += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="10" fill="${colors[lvl]}" filter="url(#neu-sm-${uid})"/>`;
        cell += `<rect x="${x + 0.5}" y="${y + 0.5}" width="${cw - 1}" height="${ch - 1}" rx="10" fill="none" stroke="${p.borderOuter}" stroke-width="1"/>`;
      }
      if (day.today) {
        cell += `<rect x="${x - 1.5}" y="${y - 1.5}" width="${cw + 3}" height="${ch + 3}" rx="12" fill="none" stroke="${p.gold}" stroke-width="2"/>`;
      }
      cell += txt(x + cw / 2, y + ch / 2 + 5, String(day.day), 13, fg, { weight: 600, anchor: "middle" });
      b.push(`<g class="pop" style="animation-delay:${delay.toFixed(3)}s">${cell}</g>`);
    });
  });

  // Languages Bar & Legend
  if (s.showLanguages && langs.length) {
    const ly = 326;
    b.push(txt(36, ly, s.languages, 13, p.textMain, { weight: 600, cls: "fade", delay: 0.3 }));
    const barColors = [p.red, p.gold, "#3178C6", "#2A9D8F", "#8338EC", "#FB8500", "#6C757D"];
    const bw = W - 72;
    // Deep Sunken Groove for Language Bar
    b.push(neuWell(36, ly + 14, bw, 16, 8, p, uid));
    b.push(`<clipPath id="lang-clip"><rect x="37" y="${ly + 15}" width="${bw - 2}" height="14" rx="7"/></clipPath>`);

    let sx = 37;
    const segs = langs.map(([, v], n) => {
      const sw = Math.max(8, ((bw - 2) * v) / total);
      const r = `<rect x="${sx.toFixed(1)}" y="${ly + 15}" width="${(sw + 1).toFixed(1)}" height="14" fill="${barColors[n % barColors.length]}"/>`;
      sx += sw;
      return r;
    });
    b.push(`<g clip-path="url(#lang-clip)"><g class="grow" style="animation-delay:.38s">${segs.join("")}</g></g>`);

    legend.forEach(([lx2, lrow, label], n) => {
      const ly2 = ly + 54 + lrow * 28;
      const col = barColors[n % barColors.length];
      b.push(
        pop(
          neuWell(lx2, ly2 - 12, 14, 14, 7, p, uid) +
            `<circle cx="${lx2 + 7}" cy="${ly2 - 5}" r="4" fill="${col}"/>` +
            txt(lx2 + 20, ly2 - 1, label, 13, p.textMain, { weight: 500 }),
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
  const h = 222;
  const uid = "streak";
  const shell = neuPanel(W, h, p, uid);
  const b = [shell.svg];
  b.push(sectionHeader(36, 26, s.title, "local_fire_department", "SERIE // 04", ctx, uid));

  const tw = (W - 72 - 18) / 2;
  const tiles = [
    [d.streak.current, s.current, "local_fire_department", p.red],
    [d.streak.longest, s.longest, "trophy", p.gold],
  ];

  tiles.forEach(([value, label, ic, accentColor], n) => {
    const tx = 36 + n * (tw + 18);
    const ty = 88;
    b.push(`<g class="up" style="animation-delay:${(0.12 + n * 0.1).toFixed(2)}s">`);
    // Extruded card
    b.push(`<rect x="${tx}" y="${ty}" width="${tw}" height="102" rx="20" fill="url(#neu-convex-${uid})" filter="url(#neu-sm-${uid})"/>`);
    b.push(`<rect x="${tx + 0.5}" y="${ty + 0.5}" width="${tw - 1}" height="101" rx="20" fill="none" stroke="${p.borderOuter}" stroke-width="1"/>`);

    // Inset circular icon chamber
    b.push(neuWell(tx + 18, ty + 24, 54, 54, 27, p, uid));
    b.push(icon(i, ic, tx + 32, ty + 38, 26, accentColor));

    const num = String(value);
    b.push(txt(tx + 86, ty + 56, num, 36, p.textMain, { weight: 700 }));
    b.push(txt(tx + 92 + textWidth(num, 36, 700), ty + 56, s.days, 15, p.textSoft, { weight: 500 }));
    b.push(txt(tx + 86, ty + 80, fit(label, 13.5, tw - 100, 500), 13.5, p.textMuted, { weight: 500 }));
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
  const w = 18 + 22 + 10 + textWidth(label, 14.5, 600) + 20;
  const delay = n * 0.06;
  const uid = `soc-${n}`;
  const accent = n === 0 ? p.gold : n === 1 ? p.accentBlue : n === 2 ? p.red : undefined;

  let body = `<rect x="5" y="5" width="${(w - 10).toFixed(1)}" height="${h - 10}" rx="14" fill="url(#neu-convex-${uid})" filter="url(#neu-sm-${uid})"/>`;
  body += `<rect x="5.5" y="5.5" width="${(w - 11).toFixed(1)}" height="${h - 11}" rx="14" fill="none" stroke="${p.borderOuter}" stroke-width="1"/>`;
  if (accent) {
    body += `<circle cx="18" cy="${h / 2}" r="3" fill="${accent}"/>`;
  }
  const extraOffset = accent ? 8 : 0;
  body += icon(i, item.icon, 16 + extraOffset, 14, 20, accent || p.red);
  body += txt(44 + extraOffset, 29, label, 14.5, p.textMain, { weight: 600 });
  return { body: neumorphicFilterDefs(p, uid) + pop(body, delay), w, h, title: label };
}

function buttonPiece({ p, i }, btn, n) {
  const h = 54;
  const size = 15;
  const iw = btn.icon ? 28 : 0;
  const w = 44 + iw + textWidth(btn.label, size, 600);
  const isFilled = btn.style === "filled";
  const uid = `btn-${n}`;
  const accentColor = isFilled ? p.gold : p.red;

  let body = `<rect x="6" y="6" width="${(w - 12).toFixed(1)}" height="${h - 12}" rx="18" fill="url(#neu-convex-${uid})" filter="url(#neu-sm-${uid})"/>`;
  body += `<rect x="6.5" y="6.5" width="${(w - 13).toFixed(1)}" height="${h - 13}" rx="18" fill="none" stroke="${p.borderOuter}" stroke-width="1.2"/>`;
  if (btn.icon) body += icon(i, btn.icon, 20, (h - 20) / 2, 20, accentColor);
  body += txt(22 + iw, h / 2 + 5.5, btn.label, size, p.textMain, { weight: 600 });
  return { body: neumorphicFilterDefs(p, uid) + pop(body, n * 0.08), w, h, title: btn.label };
}

const GAP = 10;
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
  const h = Math.max(...pieces.map((x) => x.h)) + 26;
  const cap = (W - pieces.reduce((a, x) => a + x.w + GAP, 0)) / 2;
  const bg = p.bg;
  files[`${prefix}-l`] = svg(
    cap,
    h,
    neumorphicFilterDefs(p, `${prefix}-l`) +
      `<rect x="14" y="4" width="${(cap + 26).toFixed(1)}" height="${h - 8}" rx="20" fill="url(#neu-convex-${prefix}-l)" stroke="${p.borderOuter}" stroke-width="1.2"/>` +
      neuWell(28, h / 2 - 7, 36, 14, 7, p, `${prefix}-l`) +
      `<circle cx="38" cy="${h / 2}" r="3" fill="${p.red}"/>` +
      `<circle cx="52" cy="${h / 2}" r="3" fill="${p.gold}"/>`,
    "",
    c.motion
  );
  files[`${prefix}-r`] = svg(
    cap,
    h,
    neumorphicFilterDefs(p, `${prefix}-r`) +
      `<rect x="-40" y="4" width="${(cap + 26).toFixed(1)}" height="${h - 8}" rx="20" fill="url(#neu-convex-${prefix}-r)" stroke="${p.borderOuter}" stroke-width="1.2"/>` +
      neuWell(cap - 64, h / 2 - 7, 36, 14, 7, p, `${prefix}-r`) +
      `<circle cx="${(cap - 52).toFixed(1)}" cy="${h / 2}" r="3" fill="${p.gold}"/>` +
      `<circle cx="${(cap - 38).toFixed(1)}" cy="${h / 2}" r="3" fill="${p.red}"/>`,
    "",
    c.motion
  );
  pieces.forEach((x, n) => {
    const w = x.w + GAP;
    const uid = `${prefix}-m-${n}`;
    files[`${prefix}-${n + 1}`] = svg(
      w,
      h,
      neumorphicFilterDefs(p, uid) +
        `<rect x="0" y="4" width="${w + 1}" height="${h - 8}" fill="url(#neu-convex-${uid})"/>` +
        `<line x1="0" y1="4.5" x2="${w + 1}" y2="4.5" stroke="${p.borderOuter}" stroke-width="1.2"/>` +
        `<line x1="0" y1="${h - 4.5}" x2="${w + 1}" y2="${h - 4.5}" stroke="${p.borderOuter}" stroke-width="1.2"/>` +
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
  const h = 44;
  const uid = "wave";
  const defs = neumorphicFilterDefs(p, uid);
  const pts = [];
  const amp = 5;
  const len = 48;
  for (let x = 0; x <= W + len * 2; x += 4) {
    pts.push(`${x} ${(h / 2 + amp * Math.sin((2 * Math.PI * x) / len)).toFixed(1)}`);
  }

  const b = [
    defs,
    // Extruded pill strip housing a sunken wave groove
    `<rect x="14" y="6" width="${W - 28}" height="32" rx="16" fill="url(#neu-convex-${uid})" filter="url(#neu-sm-${uid})"/>`,
    neuWell(24, 12, W - 48, 20, 10, p, uid),
    `<clipPath id="w-clip"><rect x="26" y="13" width="${W - 52}" height="18" rx="9"/></clipPath>`,
    `<g clip-path="url(#w-clip)">`,
    `<path class="wave" d="M${pts.join(" L")}" fill="none" stroke="${p.shLight}" stroke-width="4.5" stroke-linecap="round" opacity="0.6"/>`,
    `<path class="wave" d="M${pts.map(p2 => { const [px, py] = p2.split(' '); return `${px} ${(parseFloat(py) - 1.5).toFixed(1)}`; }).join(" L")}" fill="none" stroke="${p.shDark}" stroke-width="4" stroke-linecap="round" opacity="0.5"/>`,
    `<path class="wave" d="M${pts.join(" L")}" fill="none" stroke="${p.gold}" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>`,
    `</g>`,
  ];
  return svg(W, h, b.join(""), "divider", c.motion);
}

function credit({ p }) {
  const label = "DESIGNED WITH NEUMORPHISM AESTHETICS // EXPRESSIVE PROFILE";
  const size = 11;
  const w = textWidth(label, size, 600) + 28;
  return svg(
    w,
    26,
    neumorphicFilterDefs(p, "cred") +
      `<rect width="${w}" height="26" rx="13" fill="${p.bg}"/>` +
      neuWell(2, 2, w - 4, 22, 11, p, "cred") +
      txt(w / 2, 16.5, label, size, p.textSoft, { weight: 600, anchor: "middle", extra: ' letter-spacing="0.8"' }),
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
  console.log("Rendered", Object.keys(files).length, "Neumorphism SVGs successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

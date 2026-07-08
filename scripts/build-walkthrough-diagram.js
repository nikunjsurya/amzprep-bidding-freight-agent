// Generates docs/walkthrough.excalidraw — a vertical scroll diagram for the Loom walkthrough.
// Run: node scripts/build-walkthrough-diagram.js
// Output: docs/walkthrough.excalidraw (valid Excalidraw v2 JSON)

const fs = require('fs');
const path = require('path');

// ---------- State ----------
let counter = 1;
const elements = [];
const sectionCounts = {};
let currentSection = null;

function makeId() { return 'el-' + (counter++).toString().padStart(4, '0'); }
function rnd() { return Math.floor(Math.random() * 2000000000); }
function startSection(name) {
  currentSection = name;
  if (!sectionCounts[name]) sectionCounts[name] = 0;
}
function tick(n = 1) { if (currentSection) sectionCounts[currentSection] += n; }

// ---------- Colors ----------
const C = {
  ORANGE: '#D97706',
  TEAL:   '#0891B2',
  SLATE:  '#1F2937',
  CREAM:  '#FEF3C7',
  SKY:    '#E0F2FE',
  GREY:   '#6B7280',
  WHITE:  '#ffffff',
  TRANS:  'transparent',
};

// ---------- Fonts ----------
const F = { VIRGIL: 1, CASCADIA: 3 };

// ---------- Base props ----------
function baseProps(groupIds = []) {
  return {
    angle: 0,
    strokeColor: C.SLATE,
    backgroundColor: C.TRANS,
    fillStyle: 'hachure',
    strokeWidth: 1.5,
    strokeStyle: 'solid',
    roughness: 2,
    opacity: 100,
    groupIds: groupIds.slice(),
    frameId: null,
    roundness: null,
    seed: rnd(),
    version: 1,
    versionNonce: rnd(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
  };
}

// ---------- Shape helpers ----------
function rect(x, y, w, h, opts = {}) {
  const el = { id: makeId(), type: 'rectangle', x, y, width: w, height: h, ...baseProps(opts.groupIds || []) };
  el.roundness = opts.roundness !== undefined ? opts.roundness : { type: 3 };
  for (const k of Object.keys(opts)) { if (k !== 'groupIds' && k !== 'roundness') el[k] = opts[k]; }
  elements.push(el); tick();
  return el;
}
function ellipse(x, y, w, h, opts = {}) {
  const el = { id: makeId(), type: 'ellipse', x, y, width: w, height: h, ...baseProps(opts.groupIds || []) };
  for (const k of Object.keys(opts)) { if (k !== 'groupIds') el[k] = opts[k]; }
  elements.push(el); tick();
  return el;
}
function diamond(x, y, w, h, opts = {}) {
  const el = { id: makeId(), type: 'diamond', x, y, width: w, height: h, ...baseProps(opts.groupIds || []) };
  el.roundness = { type: 2 };
  for (const k of Object.keys(opts)) { if (k !== 'groupIds' && k !== 'roundness') el[k] = opts[k]; }
  elements.push(el); tick();
  return el;
}
function bbox(points) {
  const xs = points.map(p => p[0]); const ys = points.map(p => p[1]);
  return { w: Math.max(1, Math.max(...xs) - Math.min(...xs)), h: Math.max(1, Math.max(...ys) - Math.min(...ys)) };
}
function line(x, y, points, opts = {}) {
  const { w, h } = bbox(points);
  const el = {
    id: makeId(), type: 'line', x, y, width: w, height: h,
    ...baseProps(opts.groupIds || []),
    points, lastCommittedPoint: null,
    startBinding: null, endBinding: null,
    startArrowhead: null, endArrowhead: null,
  };
  for (const k of Object.keys(opts)) {
    if (!['groupIds','points'].includes(k)) el[k] = opts[k];
  }
  elements.push(el); tick();
  return el;
}
function arrow(x, y, points, opts = {}) {
  const { w, h } = bbox(points);
  const el = {
    id: makeId(), type: 'arrow', x, y, width: w, height: h,
    ...baseProps(opts.groupIds || []),
    points, lastCommittedPoint: null,
    startBinding: null, endBinding: null,
    startArrowhead: null, endArrowhead: 'arrow',
  };
  for (const k of Object.keys(opts)) {
    if (!['groupIds','points'].includes(k)) el[k] = opts[k];
  }
  elements.push(el); tick();
  return el;
}
function text(x, y, content, opts = {}) {
  const fontSize = opts.fontSize || 20;
  const fontFamily = opts.fontFamily || F.VIRGIL;
  const lines = String(content).split('\n');
  const maxLine = Math.max(...lines.map(l => l.length));
  const charW = fontFamily === F.CASCADIA ? fontSize * 0.62 : fontSize * 0.58;
  const width = opts.width || Math.max(40, Math.round(maxLine * charW + 10));
  const height = opts.height || Math.round(lines.length * fontSize * 1.25 + 4);
  const el = {
    id: makeId(), type: 'text', x, y, width, height,
    ...baseProps(opts.groupIds || []),
    strokeColor: opts.strokeColor || C.SLATE,
    backgroundColor: C.TRANS,
    text: content,
    fontSize, fontFamily,
    textAlign: opts.textAlign || 'left',
    verticalAlign: opts.verticalAlign || 'top',
    baseline: Math.round(fontSize * 0.8),
    containerId: null,
    originalText: content,
    lineHeight: 1.25,
  };
  for (const k of Object.keys(opts)) {
    if (!['groupIds','fontSize','fontFamily','textAlign','verticalAlign','strokeColor','width','height'].includes(k)) {
      el[k] = opts[k];
    }
  }
  elements.push(el); tick();
  return el;
}

// ---------- Layout constants ----------
const CANVAS_W = 1600;
const CENTER = CANVAS_W / 2;
const SECTION_GAP = 160;

// ---------- Section 1: The Problem ----------
startSection('1_problem');
{
  const gid = ['g-problem'];
  let y = 80;

  text(CENTER - 210, y, 'The Problem', { fontSize: 64, strokeColor: C.ORANGE, groupIds: gid, textAlign: 'center', width: 420 });
  y += 90;
  text(CENTER - 320, y, 'How freight quotes actually get done today.', { fontSize: 22, strokeColor: C.GREY, groupIds: gid, textAlign: 'center', width: 640 });
  y += 70;

  // Request box (top center)
  const reqX = CENTER - 180, reqY = y, reqW = 360, reqH = 90;
  rect(reqX, reqY, reqW, reqH, { strokeColor: C.SLATE, groupIds: gid });
  text(reqX + 20, reqY + 14, 'Customer Email', { fontSize: 20, strokeColor: C.ORANGE, groupIds: gid });
  text(reqX + 20, reqY + 44, '"28 pallets, Denver to YVR4,\n pickup Thursday"', { fontSize: 14, strokeColor: C.SLATE, groupIds: gid });

  // Carrier boxes fanned below
  const carriers = [
    { name: 'SmarteFreight', x: 160, w: 190, h: 70 },
    { name: 'Reach & Freight', x: 410, w: 210, h: 80 },
    { name: 'Borderless', x: 680, w: 180, h: 65 },
    { name: 'Consolidated', x: 920, w: 200, h: 85 },
    { name: 'XPO', x: 1180, w: 160, h: 60 },
  ];
  const carrierY = reqY + reqH + 130;
  carriers.forEach((c, i) => {
    rect(c.x, carrierY, c.w, c.h, { strokeColor: C.SLATE, groupIds: gid });
    text(c.x + 14, carrierY + c.h / 2 - 12, c.name, { fontSize: 16, strokeColor: C.SLATE, groupIds: gid });

    // messy arrow from request to each carrier
    const srcX = reqX + reqW / 2;
    const srcY = reqY + reqH;
    const dstX = c.x + c.w / 2;
    const dstY = carrierY;
    // Slightly kinked arrow for sketchy feel
    const midJitter = (i - 2) * 20 + (i * 7 % 13);
    arrow(srcX, srcY, [
      [0, 0],
      [(dstX - srcX) * 0.4 + midJitter, (dstY - srcY) * 0.5],
      [dstX - srcX, dstY - srcY],
    ], { strokeColor: C.GREY, strokeWidth: 1, groupIds: gid });
  });

  // Reply bubbles (ellipses) with messy snippets
  const replies = [
    { text: '"we can do $1302 cad,\n 3 day transit"', x: 180, y: carrierY + 160, w: 260, h: 80 },
    { text: '"our FTL rate is 2020.\n confirm weight?"', x: 620, y: carrierY + 170, w: 250, h: 80 },
    { text: '"thirteen hundred,\n 4 day transit"', x: 1060, y: carrierY + 155, w: 240, h: 80 },
  ];
  replies.forEach(r => {
    ellipse(r.x, r.y, r.w, r.h, { strokeColor: C.GREY, groupIds: gid });
    text(r.x + 20, r.y + 18, r.text, { fontSize: 14, strokeColor: C.SLATE, groupIds: gid });
  });

  // Connect carrier boxes to reply bubbles (messy)
  const replyLinks = [
    { from: { x: 255, y: carrierY + 70 }, to: { x: 310, y: carrierY + 160 } },
    { from: { x: 515, y: carrierY + 80 }, to: { x: 745, y: carrierY + 170 } },
    { from: { x: 1260, y: carrierY + 60 }, to: { x: 1180, y: carrierY + 155 } },
  ];
  replyLinks.forEach(l => {
    arrow(l.from.x, l.from.y, [[0, 0], [l.to.x - l.from.x, l.to.y - l.from.y]], { strokeColor: C.GREY, strokeWidth: 1, groupIds: gid });
  });

  // Clock on the right margin
  const clkX = 1380, clkY = reqY + 10, clkR = 80;
  ellipse(clkX, clkY, clkR * 2, clkR * 2, { strokeColor: C.ORANGE, strokeWidth: 2, groupIds: gid });
  // Clock hands
  line(clkX + clkR, clkY + clkR, [[0, 0], [0, -50]], { strokeColor: C.ORANGE, strokeWidth: 2, groupIds: gid });
  line(clkX + clkR, clkY + clkR, [[0, 0], [40, 10]], { strokeColor: C.ORANGE, strokeWidth: 2, groupIds: gid });
  text(clkX - 30, clkY + clkR * 2 + 12, '3 to 24 hours', { fontSize: 18, strokeColor: C.ORANGE, groupIds: gid });
  text(clkX - 30, clkY + clkR * 2 + 38, 'per quote', { fontSize: 14, strokeColor: C.GREY, groupIds: gid });

  // Sketched person (lower left)
  const pX = 100, pY = carrierY + 280;
  ellipse(pX, pY, 40, 40, { strokeColor: C.SLATE, groupIds: gid });
  line(pX + 20, pY + 40, [[0, 0], [0, 50]], { strokeColor: C.SLATE, groupIds: gid });
  line(pX + 20, pY + 55, [[0, 0], [-20, 20]], { strokeColor: C.SLATE, groupIds: gid });
  line(pX + 20, pY + 55, [[0, 0], [22, 18]], { strokeColor: C.SLATE, groupIds: gid });
  line(pX + 20, pY + 90, [[0, 0], [-15, 30]], { strokeColor: C.SLATE, groupIds: gid });
  line(pX + 20, pY + 90, [[0, 0], [15, 30]], { strokeColor: C.SLATE, groupIds: gid });
  // thought bubble
  const tbX = pX + 80, tbY = pY - 30;
  ellipse(tbX, tbY, 180, 70, { strokeColor: C.GREY, groupIds: gid });
  text(tbX + 40, tbY + 22, '"now what?"', { fontSize: 18, strokeColor: C.SLATE, groupIds: gid });
  ellipse(tbX - 12, tbY + 55, 18, 14, { strokeColor: C.GREY, groupIds: gid });
  ellipse(tbX - 24, tbY + 72, 10, 8, { strokeColor: C.GREY, groupIds: gid });

  // Ground-truth annotation at bottom
  text(CENTER - 480, carrierY + 420, 'AMZ Prep. 2B GMV. 50 plus warehouses. Every quote is a small fire.', { fontSize: 20, strokeColor: C.GREY, groupIds: gid, textAlign: 'center', width: 960 });

  // Section divider
  line(200, carrierY + 490, [[0, 0], [1200, 0]], { strokeColor: C.GREY, strokeWidth: 1, strokeStyle: 'dashed', groupIds: gid });
}

// ---------- Section 2: The Agent ----------
startSection('2_agent');
{
  const gid = ['g-agent'];
  let y = 1100;
  text(CENTER - 230, y, 'So I built an agent.', { fontSize: 56, strokeColor: C.ORANGE, groupIds: gid, textAlign: 'center', width: 460 });
  y += 100;

  // Central agent box with subtle cream background
  const agX = CENTER - 220, agY = y, agW = 440, agH = 160;
  // Shadow
  rect(agX + 8, agY + 8, agW, agH, { strokeColor: C.GREY, backgroundColor: C.TRANS, strokeWidth: 1, strokeStyle: 'dashed', groupIds: gid });
  rect(agX, agY, agW, agH, { strokeColor: C.SLATE, backgroundColor: C.CREAM, fillStyle: 'hachure', strokeWidth: 2, groupIds: gid });
  text(agX + 70, agY + 30, 'Freight Bidding Agent', { fontSize: 28, strokeColor: C.ORANGE, groupIds: gid });
  text(agX + 110, agY + 78, 'the machine in the middle', { fontSize: 16, strokeColor: C.GREY, groupIds: gid });
  text(agX + 90, agY + 112, 'deterministic + Claude where it counts', { fontSize: 14, strokeColor: C.SLATE, groupIds: gid });

  // Four input/output nodes
  const nodes = [
    { label: 'incoming\n request', x: agX - 260, y: agY - 10, dir: 'right' },
    { label: 'carrier\n rates', x: agX - 260, y: agY + agH - 90, dir: 'right' },
    { label: 'markup\n rules', x: agX + agW + 80, y: agY - 10, dir: 'left' },
    { label: 'quote out', x: agX + agW + 80, y: agY + agH - 90, dir: 'left' },
  ];
  nodes.forEach(n => {
    rect(n.x, n.y, 180, 90, { strokeColor: C.SLATE, strokeWidth: 1, groupIds: gid });
    text(n.x + 20, n.y + 22, n.label, { fontSize: 18, strokeColor: C.SLATE, groupIds: gid });
    if (n.dir === 'right') {
      arrow(n.x + 180, n.y + 45, [[0, 0], [80, 0]], { strokeColor: C.ORANGE, strokeWidth: 2, groupIds: gid });
    } else {
      arrow(agX + agW, n.y + 45, [[0, 0], [80, 0]], { strokeColor: C.ORANGE, strokeWidth: 2, groupIds: gid });
    }
  });

  y = agY + agH + 60;
  text(CENTER - 620, y, 'A 10-stage state machine that takes a freight request and returns a priced, approved quote. In seconds.', {
    fontSize: 18, strokeColor: C.SLATE, groupIds: gid, textAlign: 'center', width: 1240
  });

  // Tech stack strip
  y += 70;
  const stackItems = ['Node.js', 'Express', 'Claude API (Sonnet 4.6)'];
  let stackX = CENTER - 340;
  stackItems.forEach((s, i) => {
    const w = s.length * 14 + 36;
    rect(stackX, y, w, 44, { strokeColor: C.TEAL, backgroundColor: C.SKY, fillStyle: 'solid', strokeWidth: 1, groupIds: gid });
    text(stackX + 18, y + 11, s, { fontSize: 18, fontFamily: F.CASCADIA, strokeColor: C.TEAL, groupIds: gid });
    stackX += w + 24;
  });

  // Divider
  line(200, y + 100, [[0, 0], [1200, 0]], { strokeColor: C.GREY, strokeWidth: 1, strokeStyle: 'dashed', groupIds: gid });
}

// ---------- Section 3: The 10 Stages ----------
startSection('3_stages');
{
  const gid = ['g-stages'];
  let y = 1880;
  text(CENTER - 180, y, 'The Pipeline', { fontSize: 56, strokeColor: C.ORANGE, groupIds: gid, textAlign: 'center', width: 360 });
  y += 90;
  text(CENTER - 540, y, 'Each stage does one thing. Each transition is logged. Each failure has a plan.', {
    fontSize: 20, strokeColor: C.GREY, groupIds: gid, textAlign: 'center', width: 1080
  });
  y += 80;

  const stages = [
    { n: 1,  name: 'Intake',      desc: 'parse incoming request',                  claude: true  },
    { n: 2,  name: 'Validate',    desc: 'format check, fingerprint for dedup',     claude: false },
    { n: 3,  name: 'Distribute',  desc: 'fan out to carriers',                     claude: false },
    { n: 4,  name: 'Collect',     desc: 'gather responses',                        claude: false },
    { n: 5,  name: 'Normalize',   desc: 'messy text to structured rates',          claude: true  },
    { n: 6,  name: 'Rebid',       desc: 'competitive round among top carriers',    claude: false },
    { n: 7,  name: 'Markup',      desc: 'apply customer-specific rules',           claude: false },
    { n: 8,  name: 'Generate',    desc: 'structured quote',                        claude: true  },
    { n: 9,  name: 'Approve',     desc: 'decision branching, accept or escalate',  claude: true  },
    { n: 10, name: 'Deliver',     desc: 'final quote out',                         claude: false },
  ];

  const boxW = 540, boxH = 110;
  const boxX = CENTER - boxW / 2;
  const gapY = 50;

  stages.forEach((s, idx) => {
    const by = y + idx * (boxH + gapY);
    rect(boxX, by, boxW, boxH, { strokeColor: C.SLATE, strokeWidth: 1.5, groupIds: gid });
    // Number circle
    ellipse(boxX + 18, by + 20, 60, 60, { strokeColor: C.ORANGE, strokeWidth: 2, groupIds: gid });
    const nStr = String(s.n);
    const nOffset = nStr.length === 1 ? 18 : 12;
    text(boxX + 18 + nOffset, by + 36, nStr, { fontSize: 24, strokeColor: C.ORANGE, groupIds: gid });

    // Stage name
    text(boxX + 100, by + 24, s.name, { fontSize: 26, strokeColor: C.SLATE, groupIds: gid });
    // Description
    text(boxX + 100, by + 62, s.desc, { fontSize: 16, strokeColor: C.GREY, groupIds: gid });

    // Teal dot if Claude touchpoint
    if (s.claude) {
      ellipse(boxX + boxW - 48, by + 42, 28, 28, { strokeColor: C.TEAL, backgroundColor: C.TEAL, fillStyle: 'solid', strokeWidth: 1, groupIds: gid });
      text(boxX + boxW + 10, by + 38, 'Claude', { fontSize: 14, fontFamily: F.CASCADIA, strokeColor: C.TEAL, groupIds: gid });
    }

    // Arrow to next stage
    if (idx < stages.length - 1) {
      arrow(CENTER, by + boxH + 2, [[0, 0], [0, gapY - 4]], { strokeColor: C.ORANGE, strokeWidth: 2, groupIds: gid });
    }
  });

  // Side annotation next to stage 5 (Normalize)
  const s5y = y + 4 * (boxH + gapY);
  text(boxX - 430, s5y + 20, 'This is where it really\n earns its keep.\n Carriers reply with\n whatever they want.\n The agent parses it.', {
    fontSize: 17, strokeColor: C.GREY, fontFamily: F.VIRGIL, groupIds: gid, width: 400
  });
  // hand-drawn pointer from annotation to stage
  arrow(boxX - 30, s5y + 55, [[0, 0], [28, 0]], { strokeColor: C.GREY, strokeWidth: 1, groupIds: gid });

  // Side annotation next to stage 9 (Approve)
  const s9y = y + 8 * (boxH + gapY);
  text(boxX + boxW + 130, s9y + 20, 'Branching lives here.\n Tied rates, declined bids,\n manual escalation.', {
    fontSize: 17, strokeColor: C.GREY, fontFamily: F.VIRGIL, groupIds: gid, width: 360
  });
  arrow(boxX + boxW + 110, s9y + 55, [[0, 0], [-28, 0]], { strokeColor: C.GREY, strokeWidth: 1, groupIds: gid });

  // Divider
  const bottom = y + stages.length * (boxH + gapY) + 40;
  line(200, bottom, [[0, 0], [1200, 0]], { strokeColor: C.GREY, strokeWidth: 1, strokeStyle: 'dashed', groupIds: gid });

  // stash for next section positioning
  global.__stagesBottom = bottom;
}

// ---------- Section 4: Where Claude Actually Lives ----------
startSection('4_claude');
{
  const gid = ['g-claude'];
  const startY = global.__stagesBottom + 160;

  // Section background (light sky) — draw as a large rectangle behind content
  const secX = 120, secW = 1360, secH = 760;
  rect(secX, startY - 10, secW, secH, { strokeColor: C.SKY, backgroundColor: C.SKY, fillStyle: 'solid', strokeWidth: 0.5, strokeStyle: 'dashed', groupIds: gid, roundness: { type: 3 } });

  let y = startY;
  text(CENTER - 380, y, 'Where Claude actually helps.', { fontSize: 52, strokeColor: C.TEAL, groupIds: gid, textAlign: 'center', width: 760 });
  y += 90;

  const cards = [
    { title: 'Intake parsing',       body: 'unstructured request to structured ticket' },
    { title: 'Rate normalization',   body: 'messy carrier replies to comparable numbers' },
    { title: 'Decision explanation', body: 'why this quote won, for audit' },
    { title: 'Quote summary',        body: 'customer-facing language from structured data' },
  ];
  const cardW = 1100, cardH = 110, cardX = CENTER - cardW / 2;
  cards.forEach((c, i) => {
    const cy = y + i * (cardH + 24);
    rect(cardX, cy, cardW, cardH, { strokeColor: C.TEAL, backgroundColor: C.WHITE, fillStyle: 'solid', strokeWidth: 2, groupIds: gid });
    // Small teal marker
    ellipse(cardX + 22, cy + cardH / 2 - 14, 28, 28, { strokeColor: C.TEAL, backgroundColor: C.TEAL, fillStyle: 'solid', groupIds: gid });
    text(cardX + 70, cy + 22, c.title, { fontSize: 26, strokeColor: C.TEAL, groupIds: gid });
    text(cardX + 70, cy + 62, c.body, { fontSize: 18, strokeColor: C.SLATE, groupIds: gid });
  });

  y += 4 * (cardH + 24) + 20;
  text(CENTER - 560, y, 'Four specific touchpoints. Not AI everywhere. Just where it earns its keep.', {
    fontSize: 20, strokeColor: C.GREY, groupIds: gid, textAlign: 'center', width: 1120
  });

  // Divider
  const bottom = startY + secH - 30;
  line(200, bottom, [[0, 0], [1200, 0]], { strokeColor: C.GREY, strokeWidth: 1, strokeStyle: 'dashed', groupIds: gid });
  global.__claudeBottom = bottom;
}

// ---------- Section 5: Reliability ----------
startSection('5_reliability');
{
  const gid = ['g-reliability'];
  const startY = global.__claudeBottom + 160;

  let y = startY;
  text(CENTER - 320, y, 'Reliability, by design.', { fontSize: 52, strokeColor: C.ORANGE, groupIds: gid, textAlign: 'center', width: 640 });
  y += 100;

  const tiles = [
    { title: 'Audit trail',   body: 'every state transition logged',         icon: 'log'   },
    { title: 'Idempotency',   body: 'fingerprint dedup, same request\n never runs twice', icon: 'fingerprint' },
    { title: 'Timeouts',      body: 'carrier silent, pipeline moves',        icon: 'clock' },
    { title: 'Tiebreaking',   body: 'rate ties resolved deterministically',  icon: 'gear'  },
  ];

  // 2x2 grid
  const tileW = 540, tileH = 200, gap = 40;
  const gridX = CENTER - tileW - gap / 2;
  tiles.forEach((t, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const tx = gridX + col * (tileW + gap);
    const ty = y + row * (tileH + gap);
    rect(tx, ty, tileW, tileH, { strokeColor: C.SLATE, backgroundColor: C.CREAM, fillStyle: 'solid', strokeWidth: 1.5, groupIds: gid });

    // Icon (sketched)
    const iconX = tx + 30, iconY = ty + 30;
    if (t.icon === 'log') {
      // stacked lines
      for (let k = 0; k < 4; k++) line(iconX, iconY + k * 12, [[0, 0], [60, 0]], { strokeColor: C.ORANGE, strokeWidth: 1.5, groupIds: gid });
    } else if (t.icon === 'fingerprint') {
      ellipse(iconX, iconY, 56, 60, { strokeColor: C.ORANGE, strokeWidth: 1.5, groupIds: gid });
      ellipse(iconX + 8, iconY + 8, 40, 44, { strokeColor: C.ORANGE, strokeWidth: 1, groupIds: gid });
      ellipse(iconX + 16, iconY + 16, 24, 28, { strokeColor: C.ORANGE, strokeWidth: 1, groupIds: gid });
    } else if (t.icon === 'clock') {
      ellipse(iconX, iconY, 56, 56, { strokeColor: C.ORANGE, strokeWidth: 1.5, groupIds: gid });
      line(iconX + 28, iconY + 28, [[0, 0], [0, -18]], { strokeColor: C.ORANGE, strokeWidth: 1.5, groupIds: gid });
      line(iconX + 28, iconY + 28, [[0, 0], [14, 6]], { strokeColor: C.ORANGE, strokeWidth: 1.5, groupIds: gid });
    } else if (t.icon === 'gear') {
      ellipse(iconX, iconY, 56, 56, { strokeColor: C.ORANGE, strokeWidth: 1.5, groupIds: gid });
      ellipse(iconX + 16, iconY + 16, 24, 24, { strokeColor: C.ORANGE, strokeWidth: 1, groupIds: gid });
      // teeth
      for (let k = 0; k < 4; k++) {
        const ang = (Math.PI / 2) * k;
        line(iconX + 28 + Math.cos(ang) * 30, iconY + 28 + Math.sin(ang) * 30, [[0, 0], [Math.cos(ang) * 10, Math.sin(ang) * 10]], { strokeColor: C.ORANGE, strokeWidth: 1.5, groupIds: gid });
      }
    }

    text(tx + 110, ty + 28, t.title, { fontSize: 28, strokeColor: C.SLATE, groupIds: gid });
    text(tx + 110, ty + 80, t.body, { fontSize: 18, strokeColor: C.GREY, groupIds: gid });
  });

  y += 2 * (tileH + gap) + 20;
  text(CENTER - 440, y, 'Replayable. Debuggable. Boring in the best way.', {
    fontSize: 22, strokeColor: C.GREY, groupIds: gid, textAlign: 'center', width: 880
  });

  // Divider
  const bottom = y + 70;
  line(200, bottom, [[0, 0], [1200, 0]], { strokeColor: C.GREY, strokeWidth: 1, strokeStyle: 'dashed', groupIds: gid });
  global.__reliabilityBottom = bottom;
}

// ---------- Section 6: The Outcome ----------
startSection('6_outcome');
{
  const gid = ['g-outcome'];
  const startY = global.__reliabilityBottom + 160;

  let y = startY;
  text(CENTER - 320, y, 'What changes when it runs.', { fontSize: 52, strokeColor: C.ORANGE, groupIds: gid, textAlign: 'center', width: 640 });
  y += 100;

  // Big number callouts (stacked)
  const callouts = [
    { before: '3 to 24 hours', after: 'seconds', caption: 'quote turnaround' },
    { before: null, after: '60% plus', caption: 'cut in turnaround' },
    { before: null, after: '50% plus', caption: 'reduction in broker workload' },
  ];

  const coX = CENTER - 550;
  callouts.forEach((c, i) => {
    const cy = y + i * 130;
    if (c.before) {
      text(coX, cy, c.before, { fontSize: 44, strokeColor: C.GREY, groupIds: gid, textAlign: 'left' });
      // strikethrough
      line(coX, cy + 30, [[0, 0], [320, 0]], { strokeColor: C.GREY, strokeWidth: 2, groupIds: gid });
      arrow(coX + 340, cy + 30, [[0, 0], [60, 0]], { strokeColor: C.ORANGE, strokeWidth: 2, groupIds: gid });
      text(coX + 420, cy, c.after, { fontSize: 54, strokeColor: C.ORANGE, groupIds: gid });
      text(coX + 420, cy + 75, c.caption, { fontSize: 18, strokeColor: C.GREY, groupIds: gid });
    } else {
      text(coX, cy, c.after, { fontSize: 54, strokeColor: C.ORANGE, groupIds: gid });
      text(coX + 280, cy + 20, c.caption, { fontSize: 22, strokeColor: C.SLATE, groupIds: gid });
    }
  });

  // Before/After sketch
  y += 3 * 130 + 40;
  // Before (messy) on left
  const beforeX = 220, beforeY = y, beforeW = 460, beforeH = 220;
  rect(beforeX, beforeY, beforeW, beforeH, { strokeColor: C.GREY, strokeWidth: 1, strokeStyle: 'dashed', groupIds: gid });
  text(beforeX + 180, beforeY + 10, 'BEFORE', { fontSize: 20, strokeColor: C.GREY, groupIds: gid });
  // Messy arrows
  const bCenter = { x: beforeX + 80, y: beforeY + 110 };
  rect(bCenter.x - 40, bCenter.y - 20, 80, 40, { strokeColor: C.SLATE, strokeWidth: 1, groupIds: gid });
  text(bCenter.x - 30, bCenter.y - 10, 'Req', { fontSize: 14, strokeColor: C.SLATE, groupIds: gid });
  const targets = [
    { x: beforeX + 240, y: beforeY + 60 },
    { x: beforeX + 300, y: beforeY + 120 },
    { x: beforeX + 250, y: beforeY + 180 },
    { x: beforeX + 360, y: beforeY + 90 },
    { x: beforeX + 380, y: beforeY + 160 },
  ];
  targets.forEach((t, i) => {
    rect(t.x, t.y, 60, 30, { strokeColor: C.GREY, strokeWidth: 1, groupIds: gid });
    arrow(bCenter.x + 40, bCenter.y, [
      [0, 0],
      [(t.x - bCenter.x - 40) * 0.5 + (i % 2 ? 20 : -20), (t.y - bCenter.y) * 0.6],
      [t.x - bCenter.x - 40, t.y - bCenter.y + 15],
    ], { strokeColor: C.GREY, strokeWidth: 1, groupIds: gid });
  });

  // After (clean) on right
  const afterX = 920, afterY = y, afterW = 460, afterH = 220;
  rect(afterX, afterY, afterW, afterH, { strokeColor: C.ORANGE, strokeWidth: 1, groupIds: gid });
  text(afterX + 190, afterY + 10, 'AFTER', { fontSize: 20, strokeColor: C.ORANGE, groupIds: gid });
  // Clean pipeline: boxes in a row
  const pipe = [
    { label: 'Req',     x: afterX + 30 },
    { label: 'Agent',   x: afterX + 170 },
    { label: 'Quote',   x: afterX + 330 },
  ];
  pipe.forEach((p, i) => {
    rect(p.x, afterY + 90, 100, 50, { strokeColor: C.SLATE, strokeWidth: 1.5, groupIds: gid });
    text(p.x + 28, afterY + 104, p.label, { fontSize: 16, strokeColor: C.SLATE, groupIds: gid });
    if (i < pipe.length - 1) {
      arrow(p.x + 100, afterY + 115, [[0, 0], [40, 0]], { strokeColor: C.ORANGE, strokeWidth: 2, groupIds: gid });
    }
  });
  text(afterX + 120, afterY + 170, 'one clean pipeline', { fontSize: 16, strokeColor: C.GREY, groupIds: gid });

  // Divider
  const bottom = y + 280;
  line(200, bottom, [[0, 0], [1200, 0]], { strokeColor: C.GREY, strokeWidth: 1, strokeStyle: 'dashed', groupIds: gid });
  global.__outcomeBottom = bottom;
}

// ---------- Section 7: The Production Path ----------
startSection('7_production');
{
  const gid = ['g-production'];
  const startY = global.__outcomeBottom + 160;

  let y = startY;
  text(CENTER - 260, y, 'How it would ship.', { fontSize: 52, strokeColor: C.ORANGE, groupIds: gid, textAlign: 'center', width: 520 });
  y += 100;

  const steps = [
    { label: 'MVP\n (working today)', color: C.ORANGE, bg: C.CREAM },
    { label: 'Real email\n ingestion',  color: C.SLATE,  bg: C.WHITE },
    { label: 'PandaDoc API',           color: C.SLATE,  bg: C.WHITE },
    { label: 'HubSpot CRM sync',       color: C.SLATE,  bg: C.WHITE },
    { label: 'Carrier API\n connectors', color: C.SLATE, bg: C.WHITE },
  ];
  const stepW = 220, stepH = 110, gap = 36;
  const totalW = steps.length * stepW + (steps.length - 1) * gap;
  let sx = CENTER - totalW / 2;
  steps.forEach((s, i) => {
    rect(sx, y, stepW, stepH, { strokeColor: s.color, backgroundColor: s.bg, fillStyle: 'solid', strokeWidth: 1.5, groupIds: gid });
    text(sx + 20, y + 28, s.label, { fontSize: 18, strokeColor: s.color, groupIds: gid });
    if (i < steps.length - 1) {
      arrow(sx + stepW + 2, y + stepH / 2, [[0, 0], [gap - 4, 0]], { strokeColor: C.ORANGE, strokeWidth: 2, groupIds: gid });
    }
    sx += stepW + gap;
  });

  y += stepH + 60;
  text(CENTER - 520, y, 'The MVP proves the agent works. This is the line to production.', {
    fontSize: 20, strokeColor: C.GREY, groupIds: gid, textAlign: 'center', width: 1040
  });

  y += 100;
  text(CENTER - 360, y, 'github.com/nikunjsurya/amzprep-bidding-freight-agent', {
    fontSize: 22, fontFamily: F.CASCADIA, strokeColor: C.TEAL, groupIds: gid, textAlign: 'center', width: 720
  });
}

// ---------- Scattered hand-drawn margin notes ----------
startSection('decorations');
{
  // Note 1 — next to pipeline around the middle
  text(120, 2200, 'this is the\n interesting part', { fontSize: 18, strokeColor: C.GREY, fontFamily: F.VIRGIL });
  arrow(260, 2230, [[0, 0], [80, 0]], { strokeColor: C.GREY, strokeWidth: 1 });

  // Small "this is why it matters" — in Claude section
  text(120, global.__stagesBottom + 260, 'this is why\n it matters', { fontSize: 18, strokeColor: C.GREY, fontFamily: F.VIRGIL });
  arrow(250, global.__stagesBottom + 285, [[0, 0], [80, 0]], { strokeColor: C.GREY, strokeWidth: 1 });

  // Small sketched pointer near outcome numbers
  const outY = (global.__reliabilityBottom || 5000) + 380;
  arrow(1360, outY, [[0, 0], [-60, 30]], { strokeColor: C.GREY, strokeWidth: 1 });
  text(1260, outY - 30, 'target numbers', { fontSize: 16, strokeColor: C.GREY, fontFamily: F.VIRGIL });
}

// ---------- Build output ----------
const doc = {
  type: 'excalidraw',
  version: 2,
  source: 'https://excalidraw.com',
  elements,
  appState: {
    gridSize: null,
    viewBackgroundColor: '#FAFAF7',
  },
  files: {},
};

const outDir = path.join(__dirname, '..', 'docs');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'walkthrough.excalidraw');
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));

// Validate by re-parsing
const parsed = JSON.parse(fs.readFileSync(outPath, 'utf8'));
const total = parsed.elements.length;

console.log('=== walkthrough.excalidraw ===');
console.log('path:         ' + outPath);
console.log('size bytes:   ' + fs.statSync(outPath).size);
console.log('total els:    ' + total);
console.log('schema ver:   ' + parsed.version);
console.log('');
console.log('--- elements per section ---');
for (const k of Object.keys(sectionCounts)) {
  console.log('  ' + k.padEnd(18) + sectionCounts[k]);
}
console.log('');
console.log('JSON parses cleanly. Open in Excalidraw.com > Open > select file.');

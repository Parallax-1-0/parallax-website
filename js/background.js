/*
 * Animated backdrop: expanding reasoning graphs, live price series, and
 * calculations that type themselves out. Everything here is generated
 * at random for decoration — none of it is real market or fund data.
 *
 * Nothing overlaps: the chart owns a fixed horizontal band, and every
 * graph and formula reserves a rectangle that no other figure may enter.
 *
 * A canvas marked data-side="right" keeps its figures to the right half on
 * wide screens, leaving the left to the page's words, with only a small
 * graph and a formula there while the page is at the top.
 */
(() => {
  'use strict';

  const canvas = document.getElementById('bg');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const intensity = Math.max(0.1, Math.min(1, parseFloat(canvas.dataset.intensity || '1')));
  const sided = canvas.dataset.side === 'right';

  const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
  const LABEL_FONT = '10px ' + MONO;
  // Logo palette as r,g,b triplets, one set per colour theme. On white the
  // figures use the darker violets, drawn a little stronger (`boost`).
  const PALETTES = {
    dark: { ink: '245,242,248', lav: '211,196,250', violet: '154,123,232', up: '211,196,250', down: '107,79,194', boost: 1 },
    light: { ink: '20,16,31', lav: '107,79,194', violet: '124,92,214', up: '154,123,232', down: '63,37,133', boost: 1.45 },
  };
  let INK, LAV, VIOLET, UP, DOWN, BOOST;
  const usePalette = () => {
    const p = document.documentElement.getAttribute('data-theme') === 'light' ? PALETTES.light : PALETTES.dark;
    INK = p.ink; LAV = p.lav; VIOLET = p.violet; UP = p.up; DOWN = p.down; BOOST = p.boost;
  };
  usePalette();

  const PAD = 18;          // minimum gap kept between any two figures
  const POINTER_PX = 24;   // how far the scene leans toward the pointer

  let W = 0;
  let H = 0;
  let now = 0;           // animation clock in seconds (pauses with the tab)
  let compact = false;   // phone-sized viewport: draw less
  const view = { px: 0, py: 0, tx: 0, ty: 0, scroll: 0, scrollTarget: 0 };

  // The scene is a little taller than the viewport and slides up as the page
  // scrolls. `chart` and `lane` are the regions figures live in. In the split
  // layout figures start at `left`, and `leftNote` / `leftLane` are the two
  // small areas beside the words (above and below them) that may hold one.
  const layout = {
    w: 0, h: 0, shift: 0, scrollMax: 0, top: 0, bottom: 0,
    split: false, left: 14, chartX: 0, chart: null, lane: null, leftNote: null, leftLane: null,
  };
  const LEFT_ALPHA = 0.6;   // figures beside the words are drawn fainter

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const rgba = (c, a) => 'rgba(' + c + ',' + Math.min(1, a * BOOST).toFixed(3) + ')';
  const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 0.577;
  const signed = (v, d) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);

  // Parallax: nearer layers (larger z) lean further toward the pointer. The
  // scroll shift is the same for every layer so figures never drift into
  // each other; PAD absorbs the small pointer-driven differences.
  const offX = (z) => view.px * POINTER_PX * z;
  // Pinned figures (the ones beside the words) do not take the scroll shift.
  const offY = (z, pinned) => view.py * POINTER_PX * z -
    (!pinned && layout.scrollMax > 0 ? clamp01(view.scroll / layout.scrollMax) * layout.shift : 0);
  // ...and fade away as soon as the page starts to scroll.
  const pinnedAlpha = () => LEFT_ALPHA * (1 - clamp01(view.scroll / (H * 0.3)));

  /* ------------------------------------------------------------------ */
  /* Geometry                                                           */
  /* ------------------------------------------------------------------ */
  const rectsHit = (a, b, pad) =>
    a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

  const inside = (inner, outer) =>
    inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

  const pointInRect = (x, y, r, pad) =>
    x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

  // True when segment a–b properly crosses segment c–d.
  const segsCross = (ax, ay, bx, by, cx, cy, dx, dy) => {
    const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
  };

  const segHitsRect = (ax, ay, bx, by, r, pad) => {
    const x0 = r.x - pad;
    const y0 = r.y - pad;
    const x1 = r.x + r.w + pad;
    const y1 = r.y + r.h + pad;
    if (ax >= x0 && ax <= x1 && ay >= y0 && ay <= y1) return true;
    if (bx >= x0 && bx <= x1 && by >= y0 && by <= y1) return true;
    return segsCross(ax, ay, bx, by, x0, y0, x1, y0) || segsCross(ax, ay, bx, by, x1, y0, x1, y1) ||
           segsCross(ax, ay, bx, by, x1, y1, x0, y1) || segsCross(ax, ay, bx, by, x0, y1, x0, y0);
  };

  // Digits that have not "resolved" yet flicker through random values.
  const scramble = (text, progress) => {
    if (progress >= 1) return text;
    const settled = Math.floor(text.length * progress);
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      out += i >= settled && ch >= '0' && ch <= '9' ? String((Math.random() * 10) | 0) : ch;
    }
    return out;
  };

  /* ------------------------------------------------------------------ */
  /* Grid                                                               */
  /* ------------------------------------------------------------------ */
  const GRID = 88;
  function drawGrid() {
    const ox = ((offX(0.2) % GRID) + GRID) % GRID;
    const oy = ((offY(0.2) % GRID) + GRID) % GRID;
    ctx.beginPath();
    for (let x = ox; x < W; x += GRID) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (let y = oy; y < H; y += GRID) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.strokeStyle = rgba(LAV, 0.04);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* ------------------------------------------------------------------ */
  /* Price series (random walks)                                        */
  /* ------------------------------------------------------------------ */
  const CHART_Z = 0.5;
  // `revert` pulls the series back toward 100 so its range stays tight enough
  // for individual candles to be visible.
  const nextPrice = (v, s) => Math.max(5, v * (1 + s.drift + s.vol * gauss()) + (s.revert || 0) * (100 - v));
  const capacity = (s) =>
    Math.max(8, Math.ceil(((W - layout.chartX) * (compact ? s.headCompact : s.head) + 40) / s.step));

  // The part of the chart's band the series is drawn in; the margins leave
  // room for its readouts so they stay inside the band too.
  const plotArea = (band) => ({ top: band.y + 22, h: Math.max(20, band.h - 44), floor: band.y + band.h - 2 });

  // Follow the visible range smoothly, but never let a value fall outside it.
  function trackRange(s, lo, hi, dt) {
    const pad = Math.max((hi - lo) * 0.08, 0.3);
    const k = Math.min(1, dt * 1.5);
    s.lo = Math.min(s.lo + (lo - pad - s.lo) * k, lo);
    s.hi = Math.max(s.hi + (hi + pad - s.hi) * k, hi);
  }

  function updateChart(s, dt) {
    s.tick += dt;
    if (s.tick > 0.07) {
      s.tick = 0;
      const b = s.bars[s.bars.length - 1];
      b.c = nextPrice(b.c, s);
      if (b.c > b.h) b.h = b.c;
      if (b.c < b.l) b.l = b.c;
    }
    s.frac += dt / s.interval;
    while (s.frac >= 1) {
      s.frac -= 1;
      const c = s.bars[s.bars.length - 1].c;
      s.bars.push({ o: c, h: c, l: c, c: c });
    }
    const cap = capacity(s);
    while (s.bars.length > cap) s.bars.shift();

    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < s.bars.length; i++) {
      if (s.bars[i].l < lo) lo = s.bars[i].l;
      if (s.bars[i].h > hi) hi = s.bars[i].h;
    }
    trackRange(s, lo, hi, dt);
  }

  // One chart: candles, their moving average as a filled line, and a live
  // marker on the latest price with its readouts.
  const MA_WINDOW = 9;
  function drawChart(s) {
    const n = s.bars.length;
    const full = n >= capacity(s);
    const ox = offX(CHART_Z) + layout.chartX - 40;
    const oy = offY(CHART_Z);
    const area = plotArea(layout.chart);
    const yOf = (v) => area.top + oy + area.h * (1 - (v - s.lo) / (s.hi - s.lo));
    const shift = full ? s.frac : 0;
    const xOf = (i) => (i - shift) * s.step + ox;
    const bodyW = Math.max(3, s.step * 0.46);

    // Moving average of the closes (over fewer bars at the very start).
    const ma = new Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += s.bars[i].c;
      if (i >= MA_WINDOW) sum -= s.bars[i - MA_WINDOW].c;
      ma[i] = sum / Math.min(i + 1, MA_WINDOW);
    }
    const tracePath = () => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (i === 0) ctx.moveTo(xOf(i), yOf(ma[i])); else ctx.lineTo(xOf(i), yOf(ma[i]));
      }
    };

    // Soft fill under the average.
    const floor = area.floor + oy;
    tracePath();
    ctx.lineTo(xOf(n - 1), floor);
    ctx.lineTo(xOf(0), floor);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, area.top + oy, 0, floor);
    g.addColorStop(0, rgba(VIOLET, s.alpha * 0.26));
    g.addColorStop(1, rgba(VIOLET, 0));
    ctx.fillStyle = g;
    ctx.fill();

    // Candles.
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const b = s.bars[i];
      const x = Math.round(xOf(i)) + 0.5;
      const up = b.c >= b.o;
      const color = up ? UP : DOWN;
      const a = s.alpha * (up ? 0.85 : 1);
      ctx.strokeStyle = rgba(color, a);
      ctx.beginPath();
      ctx.moveTo(x, yOf(b.h));
      ctx.lineTo(x, yOf(b.l));
      ctx.stroke();
      const top = yOf(Math.max(b.o, b.c));
      const height = Math.max(1, yOf(Math.min(b.o, b.c)) - top);
      ctx.fillStyle = rgba(color, a);
      ctx.fillRect(x - bodyW / 2, top, bodyW, height);
    }

    // The average, drawn over the candles.
    tracePath();
    ctx.strokeStyle = rgba(VIOLET, s.alpha * 1.25);
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Last-price guide, live marker, and readouts.
    const live = s.bars[n - 1].c;
    const hx = xOf(n - 1);
    const hy = yOf(live);

    ctx.beginPath();
    ctx.setLineDash([2, 6]);
    ctx.moveTo(hx + bodyW, hy + 0.5);
    ctx.lineTo(W, hy + 0.5);
    ctx.strokeStyle = rgba(VIOLET, s.alpha * 0.55);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    const pulse = 0.5 + 0.5 * Math.sin(now * 3);
    ctx.beginPath();
    ctx.arc(hx, hy, 7 + pulse * 5, 0, Math.PI * 2);
    ctx.fillStyle = rgba(VIOLET, s.alpha * 0.2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hx, hy, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = rgba(INK, Math.min(1, s.alpha * 1.9));
    ctx.fill();

    const change = (live / s.bars[0].o - 1) * 100;
    const tx = hx + bodyW + 10;
    ctx.textBaseline = 'alphabetic';
    ctx.font = '11px ' + MONO;
    ctx.fillStyle = rgba(INK, Math.min(1, s.alpha * 1.5));
    ctx.fillText(live.toFixed(2), tx, hy - 9);
    ctx.fillStyle = rgba(LAV, s.alpha * 1.2);
    ctx.fillText(signed(change, 2) + '%', tx, hy + 16);
    ctx.font = LABEL_FONT;
    ctx.fillStyle = rgba(VIOLET, Math.min(1, s.alpha * 1.6));
    ctx.fillText('MA(' + MA_WINDOW + ') ' + ma[n - 1].toFixed(2), tx, hy + 31);

    // In the split layout the chart dissolves toward the words on its left.
    if (layout.split) {
      const x0 = layout.chartX - 20;
      const x1 = layout.chartX + W * 0.15;
      const fade = ctx.createLinearGradient(x0, 0, x1, 0);
      fade.addColorStop(0, 'rgba(0,0,0,1)');
      fade.addColorStop(0.35, 'rgba(0,0,0,0.82)');
      fade.addColorStop(0.7, 'rgba(0,0,0,0.3)');
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      const alpha = ctx.globalAlpha;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = fade;
      ctx.fillRect(0, layout.chart.y + oy - 30, x1, layout.chart.h + 60);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Expanding graphs                                                   */
  /* ------------------------------------------------------------------ */
  const clusters = [];
  const floaters = [];

  const LABELS = [
    () => rand(0, 1).toFixed(4),
    () => signed(rand(-4, 6), 2) + '%',
    () => rand(10, 480).toFixed(2),
    () => 'p=' + rand(0.5, 0.99).toFixed(2),
    () => 'w=' + rand(0.01, 0.2).toFixed(3),
  ];

  // Is this rectangle clear of the chart's band and every other figure?
  function isFree(rect) {
    if (rectsHit(rect, layout.chart, PAD)) return false;
    for (let i = 0; i < clusters.length; i++) if (rectsHit(rect, clusters[i].rect, PAD)) return false;
    for (let i = 0; i < floaters.length; i++) if (rectsHit(rect, floaters[i].rect, PAD)) return false;
    return true;
  }

  const wantedClusters = () => (compact ? 2 : Math.max(2, Math.min(5, Math.floor(layout.lane.w / 420))));

  const mainClusters = () => clusters.reduce((k, c) => k + (c.pinned ? 0 : 1), 0);

  // Claim a free square in a lane and plant a root there.
  function seedCluster(lane, largest, smallest, pinned) {
    const maxR = Math.min(largest, lane.h / 2, lane.w / 2);
    const minR = Math.min(smallest, maxR);
    if (maxR < 40) return false;
    const TRIES = 14;
    for (let i = 0; i < TRIES; i++) {
      const R = maxR - (maxR - minR) * (i / (TRIES - 1));
      const cx = rand(lane.x + R, lane.x + lane.w - R);
      const cy = rand(lane.y + R, lane.y + lane.h - R);
      const rect = { x: cx - R, y: cy - R, w: R * 2, h: R * 2 };
      if (!isFree(rect)) continue;
      const c = {
        z: rand(0.6, 1),
        pinned,
        cx, cy, R, rect,
        nodes: [],
        edges: [],
        labels: [],
        pulses: [],
        state: 'grow',
        t: 0,
        spawnIn: 0,
        pulseIn: rand(0.4, 1.2),
        misses: 0,
        max: Math.round(R / (compact ? 6.5 : 7.5)),
        gap: Math.max(22, R * 0.19),
        hold: rand(3.5, 6.5),
        alpha: 1,
      };
      c.nodes.push({
        x: cx, y: cy, gen: 0, kids: 0, angle: 0,
        born: now, parent: null, phase: rand(0, 6.28), r: 3.4, label: null, hit: -10,
      });
      clusters.push(c);
      return true;
    }
    return false;
  }

  // Would a new edge p→(x, y) run through another edge or a label?
  function edgeBlocked(c, a, bx, by, b) {
    for (let i = 0; i < c.edges.length; i++) {
      const e = c.edges[i];
      if (e.a === a || e.b === a || e.a === b || e.b === b) continue;
      if (segsCross(a.x, a.y, bx, by, e.a.x, e.a.y, e.b.x, e.b.y)) return true;
    }
    for (let i = 0; i < c.labels.length; i++) {
      if (segHitsRect(a.x, a.y, bx, by, c.labels[i].rect, 3)) return true;
    }
    return false;
  }

  // Find a spot beside the node where its value fits without touching anything.
  function placeLabel(c, n, text) {
    ctx.font = LABEL_FONT;
    const w = Math.ceil(ctx.measureText(text).width) + 2;
    const h = 13;
    const spots = [
      { x: n.x + 8, y: n.y - 17 }, { x: n.x - 8 - w, y: n.y - 17 },
      { x: n.x + 8, y: n.y + 5 }, { x: n.x - 8 - w, y: n.y + 5 },
    ];
    for (let s = 0; s < spots.length; s++) {
      const rect = { x: spots[s].x, y: spots[s].y, w, h };
      if (!inside(rect, c.rect)) continue;
      if (c.labels.some((l) => rectsHit(rect, l.rect, 5))) continue;
      if (c.nodes.some((m) => m !== n && pointInRect(m.x, m.y, rect, 8))) continue;
      if (c.edges.some((e) => segHitsRect(e.a.x, e.a.y, e.b.x, e.b.y, rect, 3))) continue;
      n.label = { text, dx: rect.x - n.x, dy: rect.y - n.y + 10 };
      c.labels.push({ node: n, rect });
      return;
    }
  }

  function growCluster(c) {
    const open = c.nodes.filter((n) => n.born <= now && n.gen < 4 && n.kids < (n.gen === 0 ? 5 : n.gen === 1 ? 3 : 2));
    if (!open.length) { c.misses++; return; }
    const p = pick(open);
    const limit = (c.R - 8) * (c.R - 8);
    for (let tries = 0; tries < 8; tries++) {
      const angle = p.gen === 0 ? rand(0, Math.PI * 2) : p.angle + rand(-1, 1);
      const dist = rand(0.3, 0.58) * c.R * (1 - p.gen * 0.12);
      const x = p.x + Math.cos(angle) * dist;
      const y = p.y + Math.sin(angle) * dist;
      if ((x - c.cx) * (x - c.cx) + (y - c.cy) * (y - c.cy) > limit) continue;
      if (c.nodes.some((n) => (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y) < c.gap * c.gap)) continue;
      if (c.labels.some((l) => pointInRect(x, y, l.rect, 8))) continue;
      if (edgeBlocked(c, p, x, y, null)) continue;
      const dur = rand(0.35, 0.65);
      const child = {
        x, y, gen: p.gen + 1, kids: 0, angle,
        born: now + dur, parent: p, phase: rand(0, 6.28),
        r: Math.max(1.5, 2.9 - p.gen * 0.45),
        label: null, hit: -10,
      };
      p.kids++;
      c.nodes.push(child);
      c.edges.push({ a: p, b: child, born: now, dur, cross: false });
      if (Math.random() < 0.34) placeLabel(c, child, pick(LABELS)());
      c.misses = 0;
      return;
    }
    c.misses++;
  }

  // When a graph stops branching, link a few nearby nodes across branches.
  function crossLink(c) {
    let added = 0;
    const reach = c.R * 0.9;
    for (let i = 0; i < 60 && added < 3; i++) {
      const a = pick(c.nodes);
      const b = pick(c.nodes);
      if (a === b || a.parent === b || b.parent === a) continue;
      if ((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) > reach * reach) continue;
      if (c.edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) continue;
      if (edgeBlocked(c, a, b.x, b.y, b)) continue;
      c.edges.push({ a, b, born: now, dur: 0.7, cross: true });
      added++;
    }
  }

  function updateCluster(c, dt) {
    if (c.state === 'grow') {
      c.spawnIn -= dt;
      if (c.spawnIn <= 0) {
        growCluster(c);
        c.spawnIn = rand(0.1, 0.34);
      }
      if (c.nodes.length >= c.max || c.misses > 10) {
        c.state = 'hold';
        c.t = 0;
        crossLink(c);
      }
    } else if (c.state === 'hold') {
      c.t += dt;
      if (c.t > c.hold) c.state = 'fade';
    } else {
      c.alpha -= dt / 1.6;
    }

    // Signals travel outward from the root along finished edges.
    c.pulseIn -= dt;
    if (c.pulseIn <= 0) {
      c.pulseIn = rand(0.35, 1.1);
      const first = c.edges.filter((e) => e.a === c.nodes[0] && now - e.born >= e.dur);
      if (first.length) c.pulses.push({ edge: pick(first), t: 0 });
    }
    for (let i = c.pulses.length - 1; i >= 0; i--) {
      const p = c.pulses[i];
      p.t += dt / 0.55;
      if (p.t < 1) continue;
      p.edge.b.hit = now;
      const onward = c.edges.filter((e) => e.a === p.edge.b && !e.cross && now - e.born >= e.dur);
      if (onward.length && Math.random() < 0.85) { p.edge = pick(onward); p.t = 0; } else c.pulses.splice(i, 1);
    }
  }

  function drawCluster(c) {
    const ox = offX(c.z);
    const oy = offY(c.z, c.pinned);
    const depth = (0.45 + 0.55 * c.z) * Math.max(0, c.alpha) * (c.pinned ? pinnedAlpha() : 1);
    if (depth <= 0.004) return;
    const px = (n) => n.x + Math.sin(now * 0.5 + n.phase) * 2 + ox;
    const py = (n) => n.y + Math.cos(now * 0.4 + n.phase) * 2 + oy;

    ctx.lineWidth = 1;
    for (let i = 0; i < c.edges.length; i++) {
      const e = c.edges[i];
      const p = easeOut(clamp01((now - e.born) / e.dur));
      const ax = px(e.a);
      const ay = py(e.a);
      const bx = ax + (px(e.b) - ax) * p;
      const by = ay + (py(e.b) - ay) * p;
      ctx.beginPath();
      if (e.cross) ctx.setLineDash([3, 5]);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = rgba(e.cross ? VIOLET : LAV, (e.cross ? 0.3 : 0.26) * depth);
      ctx.stroke();
      if (e.cross) ctx.setLineDash([]);
      if (p < 1) {
        ctx.beginPath();
        ctx.arc(bx, by, 2, 0, Math.PI * 2);
        ctx.fillStyle = rgba(INK, 0.9 * depth);
        ctx.fill();
      }
    }

    for (let i = 0; i < c.pulses.length; i++) {
      const p = c.pulses[i];
      const ax = px(p.edge.a);
      const ay = py(p.edge.a);
      const x = ax + (px(p.edge.b) - ax) * p.t;
      const y = ay + (py(p.edge.b) - ay) * p.t;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = rgba(VIOLET, 0.22 * depth);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = rgba(INK, 0.95 * depth);
      ctx.fill();
    }

    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < c.nodes.length; i++) {
      const n = c.nodes[i];
      const age = now - n.born;
      if (age < 0) continue;
      const x = px(n);
      const y = py(n);
      const grow = easeOut(clamp01(age / 0.3));

      if (age < 0.9) {
        ctx.beginPath();
        ctx.arc(x, y, n.r + 12 * (age / 0.9), 0, Math.PI * 2);
        ctx.strokeStyle = rgba(LAV, 0.5 * (1 - age / 0.9) * depth);
        ctx.stroke();
      }
      const sinceHit = now - n.hit;
      if (sinceHit < 0.5) {
        ctx.beginPath();
        ctx.arc(x, y, n.r + 6, 0, Math.PI * 2);
        ctx.fillStyle = rgba(VIOLET, 0.35 * (1 - sinceHit / 0.5) * depth);
        ctx.fill();
      }
      if (n.gen === 0) {
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fillStyle = rgba(VIOLET, 0.16 * depth);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, n.r * grow, 0, Math.PI * 2);
      ctx.fillStyle = rgba(n.gen === 0 ? INK : LAV, (n.gen === 0 ? 0.95 : 0.8) * depth);
      ctx.fill();

      if (n.label) {
        ctx.fillStyle = rgba(LAV, 0.5 * depth * clamp01(age / 0.25));
        ctx.fillText(scramble(n.label.text, age / 0.7), x + n.label.dx, y + n.label.dy);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Calculations that type themselves out                              */
  /* ------------------------------------------------------------------ */
  const FORMULAS = [
    ['E[r] = Σ w·r = ', () => rand(1, 14).toFixed(2) + '%'],
    ['σ² = Σ(x − μ)² / n = ', () => rand(0.01, 0.09).toFixed(4)],
    ['β = cov(r, m) / var(m) = ', () => rand(0.6, 1.5).toFixed(3)],
    ['ρ(a, b) = ', () => signed(rand(-0.9, 0.9), 3)],
    ['∂V/∂S = ', () => rand(0.1, 0.95).toFixed(4)],
    ['NPV = Σ CF / (1 + r)^t = ', () => rand(120, 980).toFixed(1)],
    ['ln(S / K) = ', () => signed(rand(-0.3, 0.3), 4)],
    ['P(x > k) = ', () => rand(0.02, 0.6).toFixed(3)],
    ['μ − ½σ² = ', () => signed(rand(-0.02, 0.09), 4)],
    ['Δ = ', () => signed(rand(-3, 5), 2) + '%'],
    ['CAGR = (Vn / V0)^(1/n) − 1 = ', () => rand(2, 18).toFixed(2) + '%'],
    ['z = (x − μ) / σ = ', () => signed(rand(-2.6, 2.6), 2)],
    ['Σ w = ', () => '1.0000'],
    ['EV / EBITDA = ', () => rand(6, 22).toFixed(1) + '×'],
    ['WACC = ', () => rand(5, 11).toFixed(2) + '%'],
    ['FCF yield = ', () => rand(1.5, 8).toFixed(2) + '%'],
  ];
  const FLOAT_Z = 0.3;
  const TYPE_CPS = 30;
  const SETTLE = 0.7;
  const REVISE_AT = 1.5;
  const HOLD = 2.8;
  const FADE = 1;

  const floatFont = () => (compact ? 10 : 12) + 'px ' + MONO;
  let floaterIn = 0.4;

  // `zone` is one of the small areas beside the words; without it the formula
  // goes anywhere free on the figures' side.
  function spawnFloater(zone) {
    const f = pick(FORMULAS);
    const first = f[1]();
    let second = Math.random() < 0.5 ? f[1]() : null;
    if (second === first) second = null;

    // Reserve room for the whole line up front, including a revised value.
    ctx.font = floatFont();
    const w = Math.ceil(ctx.measureText(f[0] + first + (second ? ' → ' + second : '')).width) + 8;
    const x0 = zone ? zone.x : layout.left;
    const x1 = (zone ? zone.x + zone.w : W - 14) - w;
    const y0 = zone ? zone.y + 12 : layout.top + 12;
    const y1 = zone ? zone.y + zone.h : layout.bottom;
    if (x1 < x0 || y1 < y0) return;

    // Graphs get first claim on the lane while one is still waiting to be placed.
    const laneReserved = !zone && mainClusters() < wantedClusters();
    for (let i = 0; i < 10; i++) {
      const x = rand(x0, x1);
      const y = rand(y0, y1);
      const rect = { x, y: y - 12, w, h: 16 };
      if (laneReserved && rectsHit(rect, layout.lane, 0)) continue;
      if (!isFree(rect)) continue;
      const typed = f[0].length / TYPE_CPS;
      floaters.push({
        rect, x, y,
        pinned: !!zone,
        text: f[0], first, second,
        born: now,
        typed,
        life: typed + SETTLE + (second ? REVISE_AT + SETTLE : 0) + HOLD + FADE,
      });
      return;
    }
  }

  let noteIn = 1.6;
  function updateFloaters(dt) {
    let main = 0;
    let note = 0;
    for (let i = floaters.length - 1; i >= 0; i--) {
      if (now - floaters[i].born > floaters[i].life) { floaters.splice(i, 1); continue; }
      if (floaters[i].pinned) note++; else main++;
    }
    floaterIn -= dt;
    if (floaterIn <= 0) {
      floaterIn = rand(0.4, 1);
      if (main < (compact ? 5 : layout.split ? 6 : 9)) spawnFloater(null);
    }
    // One formula at a time beside the words.
    if (layout.leftNote && note === 0) {
      noteIn -= dt;
      if (noteIn <= 0) { noteIn = rand(1.2, 2.6); spawnFloater(layout.leftNote); }
    }
  }

  function drawFloaters() {
    const ox = offX(FLOAT_Z);
    ctx.font = floatFont();
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < floaters.length; i++) {
      const f = floaters[i];
      const age = now - f.born;
      const a = clamp01((f.life - age) / FADE) * (f.pinned ? pinnedAlpha() : 1);
      if (a <= 0.004) continue;
      const x = f.x + ox;
      const y = f.y + offY(FLOAT_Z, f.pinned);

      const shown = f.text.slice(0, Math.floor(age * TYPE_CPS));
      ctx.fillStyle = rgba(LAV, 0.42 * a);
      ctx.fillText(shown, x, y);
      let cursor = x + ctx.measureText(shown).width;

      const t1 = age - f.typed;
      if (t1 < 0) {
        if (Math.floor(now * 2.5) % 2 === 0) ctx.fillRect(cursor + 1, y - 9, 5, 11);
        continue;
      }
      const revising = f.second !== null && t1 > SETTLE + REVISE_AT;
      const firstText = scramble(f.first, t1 / SETTLE);
      ctx.fillStyle = rgba(INK, (revising ? 0.38 : 0.78) * a);
      ctx.fillText(firstText, cursor, y);
      if (revising) {
        cursor += ctx.measureText(firstText).width;
        ctx.fillStyle = rgba(VIOLET, 0.8 * a);
        ctx.fillText(' → ', cursor, y);
        cursor += ctx.measureText(' → ').width;
        ctx.fillStyle = rgba(INK, 0.82 * a);
        ctx.fillText(scramble(f.second, (t1 - SETTLE - REVISE_AT) / SETTLE), cursor, y);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Scene                                                              */
  /* ------------------------------------------------------------------ */
  const chart = {
    bars: [{ o: 100, h: 100, l: 100, c: 100 }], frac: 0, tick: 0, lo: 98, hi: 102,
    step: 20, interval: 0.8, head: 0.84, headCompact: 0.72,
    drift: 0, vol: 0.006, revert: 0.02, alpha: 0.5,
  };
  let seedIn = 0;
  let leftSeedIn = 1;

  // Carve the scene into the regions each kind of figure may use.
  function computeLayout() {
    const scrollMax = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    layout.scrollMax = scrollMax;
    layout.shift = Math.min(H * 0.12, scrollMax * 0.08);
    layout.w = W;
    layout.h = H + layout.shift;
    const Hw = layout.h;
    layout.top = Math.max(84, Hw * 0.1);     // keeps figures clear of the header
    layout.bottom = Hw - 14;
    layout.split = sided && W >= 900;
    layout.left = layout.split ? Math.round(W * 0.56) : 14;
    layout.chartX = layout.split ? Math.round(W * 0.5) : 0;
    layout.chart = {
      x: layout.chartX - (layout.split ? 20 : 80), y: Hw * 0.14,
      w: W - layout.chartX + 160, h: Hw * 0.25,
    };
    const laneTop = Hw * 0.39 + PAD;
    layout.lane = { x: layout.left, y: laneTop, w: W - 14 - layout.left, h: Hw * 0.94 - laneTop };

    // Beside the words: a strip above them for a formula and one below for a
    // small graph. The words sit around the middle of the viewport.
    layout.leftNote = null;
    layout.leftLane = null;
    if (layout.split) {
      const x = Math.max(Math.min(64, W * 0.05), (W - 1240) / 2);
      const mid = H / 2;
      const noteTop = Math.max(layout.top, 104);
      const laneY = mid + 128;
      if (mid - 104 - noteTop >= 24) layout.leftNote = { x, y: noteTop, w: W * 0.4 - x, h: mid - 104 - noteTop };
      if (H - 66 - laneY >= 96) layout.leftLane = { x, y: laneY, w: W * 0.42 - x, h: H - 66 - laneY };
    }
  }

  function update(dt) {
    view.px += (view.tx - view.px) * Math.min(1, dt * 3);
    view.py += (view.ty - view.py) * Math.min(1, dt * 3);
    view.scroll += (view.scrollTarget - view.scroll) * Math.min(1, dt * 8);

    updateChart(chart, dt);

    let pinned = 0;
    for (let i = clusters.length - 1; i >= 0; i--) {
      updateCluster(clusters[i], dt);
      if (clusters[i].alpha <= 0) clusters.splice(i, 1);
      else if (clusters[i].pinned) pinned++;
    }
    if (clusters.length - pinned < wantedClusters()) {
      seedIn -= dt;
      if (seedIn <= 0) {
        seedIn = seedCluster(layout.lane, compact ? 88 : 165, compact ? 56 : 90, false) ? rand(0.5, 1.4) : 0.4;
      }
    }
    // One small graph at a time beside the words.
    if (layout.leftLane && pinned === 0) {
      leftSeedIn -= dt;
      if (leftSeedIn <= 0) leftSeedIn = seedCluster(layout.leftLane, 86, 52, true) ? rand(1, 2.2) : 0.6;
    }

    updateFloaters(dt);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = intensity;
    drawChart(chart);   // first: its left edge is faded by erasing, which must not touch the rest
    drawGrid();
    for (let i = 0; i < clusters.length; i++) drawCluster(clusters[i]);
    drawFloaters();
    ctx.globalAlpha = 1;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Phone browsers resize constantly as their toolbars slide; only a real
    // change of shape is worth re-planning the scene for.
    const replan = w !== layout.w || Math.abs(h + layout.shift - layout.h) > 120 || !layout.lane;
    W = w;
    H = h;
    compact = W < 720;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (replan) {
      computeLayout();
      clusters.length = 0;
      floaters.length = 0;
    }
    if (reduceMotion && started) {
      for (let i = 0; i < 900; i++) { now += 0.016; update(0.016); }
      draw();
    }
  }

  // Give the chart some history up front so it is already most of the way
  // across on load, then keep drawing itself from there.
  function prefill() {
    const bars = Math.floor(capacity(chart) * 0.8);
    for (let i = 0; i < bars; i++) {
      const b = chart.bars[chart.bars.length - 1];
      for (let k = 0; k < 11; k++) {
        b.c = nextPrice(b.c, chart);
        if (b.c > b.h) b.h = b.c;
        if (b.c < b.l) b.l = b.c;
      }
      chart.bars.push({ o: b.c, h: b.c, l: b.c, c: b.c });
    }
  }

  let started = false;
  let raf = 0;
  let last = 0;
  function frame(ts) {
    const t = ts / 1000;
    const dt = Math.min(0.05, last ? t - last : 0.016);
    last = t;
    now += dt;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  prefill();
  started = true;

  // Recolour when the theme is switched; a still scene needs redrawing by hand.
  new MutationObserver(() => {
    usePalette();
    if (reduceMotion) draw();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (reduceMotion) {
    // No motion requested: build up a settled scene and show a single still frame.
    for (let i = 0; i < 900; i++) { now += 0.016; update(0.016); }
    draw();
    return;
  }

  window.addEventListener('pointermove', (e) => {
    view.tx = e.clientX / W - 0.5;
    view.ty = e.clientY / H - 0.5;
  }, { passive: true });
  window.addEventListener('scroll', () => {
    view.scrollTarget = window.scrollY;
    // The page can change length after load (the front page's zoom track
    // switches on and off with the viewport), so keep the scroll range current.
    layout.scrollMax = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    last = 0;
    if (!document.hidden) raf = requestAnimationFrame(frame);
  });

  // Start with a little history so the first frame is not empty.
  for (let i = 0; i < 240; i++) { now += 0.016; update(0.016); }
  raf = requestAnimationFrame(frame);
})();

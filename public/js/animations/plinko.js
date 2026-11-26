/* global gsap */
/**
 * Tablero vertical tipo Plinko / pinball.
 * El recorrido es solo visual: el área ganadora ya viene del motor.
 */
(function () {
  const CFG = {
    ballR: 12,
    pegR: 6.4,
    flowerR: 18,
    smileR: 15,
    peaceR: 14,
    gravity: 2300,
    dt: 1 / 120,
    margin: 26,
    pocketH: 64,
    band: 188,
    firstPocketY: 320,
    maxHops: 28,
    minHops: 7,
  };

  function mulberry32(a) {
    let t = a >>> 0;
    return function rng() {
      t += 0x6d2b79f5;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(value) {
    const str = String(value || 'ruleta');
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function chooseCols(n, width) {
    const bySpace = Math.max(2, Math.min(5, Math.floor((width - 28) / 172)));
    if (n <= 1) return 1;
    if (n <= 4) return Math.min(n, bySpace, 3);
    if (n <= 8) return Math.min(3, bySpace);
    if (n <= 16) return Math.min(4, bySpace);
    return bySpace;
  }

  function brickPlan(n, wide) {
    const plan = [];
    let left = Math.max(n, 1);
    let shifted = false;
    while (left > 0) {
      const cap = shifted && wide > 1 ? wide - 1 : wide;
      const count = Math.min(left, Math.max(1, cap));
      plan.push({ count, shifted: shifted && wide > 1 });
      left -= count;
      shifted = !shifted;
    }
    return plan;
  }

  function brickMetrics(wide, usable) {
    if (wide <= 1) {
      const w = clamp(usable * 0.42, 108, 210);
      return { w, pitch: w, origin: (usable - w) / 2 };
    }
    let gap = 96;
    let w = (usable - (wide - 1) * gap) / wide;
    if (w > 210) {
      w = 210;
      gap = (usable - wide * w) / (wide - 1);
    } else if (w < 108) {
      w = 108;
      gap = Math.max(40, (usable - wide * w) / (wide - 1));
    }
    const pitch = w + gap;
    const rowWidth = wide * w + (wide - 1) * gap;
    return { w, pitch, origin: Math.max(0, (usable - rowWidth) / 2) };
  }

  function layoutBoard(areas, boardWidth) {
    const width = Math.max(340, Math.min(960, Math.round(boardWidth || 880)));
    const source = (areas || []).map((a) => ({
      id: a.id,
      nombre: a.nombre || 'Área',
      dimmed: !!a.dimmed,
    }));
    source.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const n = Math.max(source.length, 1);
    const cols = chooseCols(n, width);
    const edge = 56;
    const usable = width - CFG.margin * 2 - edge * 2;
    const plan = brickPlan(source.length, cols);
    const rows = plan.length;
    const metrics = brickMetrics(cols, usable);
    const pockets = [];
    let index = 0;
    plan.forEach((course, row) => {
      const capacity = course.shifted ? Math.max(1, cols - 1) : cols;
      const extra = Math.max(0, capacity - course.count) * metrics.pitch / 2;
      const shift = course.shifted ? metrics.pitch / 2 : 0;
      for (let col = 0; col < course.count; col++) {
        const area = source[index] || { id: 'area', nombre: 'Área', dimmed: false };
        index += 1;
        const w = metrics.w;
        const mouth = clamp(w * 0.42, CFG.ballR * 2 + 8, 72);
        const x = clamp(
          CFG.margin + edge + metrics.origin + shift + extra + w / 2 + col * metrics.pitch,
          CFG.margin + w / 2,
          width - CFG.margin - w / 2
        );
        pockets.push({
          id: area.id,
          nombre: area.nombre,
          dimmed: area.dimmed,
          row,
          col,
          w,
          h: CFG.pocketH,
          mouth,
          x,
          y: CFG.firstPocketY + row * CFG.band,
        });
      }
    });

    let floor = CFG.firstPocketY;
    for (const pocket of pockets) floor = Math.max(floor, pocket.y + pocket.h);
    const height = floor + 48;

    const pegs = [];
    const gapX = 52;
    const gapY = 44;
    let pr = 0;
    for (let y = 72; y < height - 24; y += gapY, pr++) {
      const shift = (pr % 2) * (gapX / 2);
      let k = 0;
      for (let x = CFG.margin + 8 + shift; x < width - CFG.margin - 4; x += gapX, k++) {
        const jx = ((hashString(pr + ':' + k + ':x') % 1000) / 1000 - 0.5) * 10;
        const jy = ((hashString(pr + ':' + k + ':y') % 1000) / 1000 - 0.5) * 6;
        const px = x + jx;
        const py = y + jy;
        if (px < CFG.margin || px > width - CFG.margin) continue;
        let blocked = false;
        for (const p of pockets) {
          const inCup =
            Math.abs(px - p.x) < p.w / 2 + 6 && py > p.y - 8 && py < p.y + p.h + 6;
          const inMouth =
            Math.abs(px - p.x) < p.mouth / 2 + CFG.ballR && py > p.y - 34 && py < p.y + 8;
          if (inCup || inMouth) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        const r = CFG.pegR + ((hashString('r' + pr + ':' + k) % 100) / 100) * 1.6;
        pegs.push({ x: px, y: py, r, i: pegs.length, kind: 'peg' });
      }
    }
    assignObstacles(pegs, pockets, width);

    return {
      width,
      height,
      cols,
      rows,
      pockets,
      pegs,
      ballR: CFG.ballR,
      ids: source.map((a) => a.id),
    };
  }

  function flowerFits(peg, pockets, width, rad) {
    if (peg.x < rad + 12 || peg.x > width - rad - 12 || peg.y < rad + 14) return false;
    for (const pocket of pockets) {
      const left = pocket.x - pocket.w / 2 - 4;
      const right = pocket.x + pocket.w / 2 + 4;
      const top = pocket.y - 8;
      const bottom = pocket.y + pocket.h + 4;
      const nx = clamp(peg.x, left, right);
      const ny = clamp(peg.y, top, bottom);
      if (Math.hypot(peg.x - nx, peg.y - ny) < rad + 1) return false;
    }
    return true;
  }

  function shuffleInPlace(list, seedKey) {
    const rng = mulberry32(hashString(seedKey));
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const swap = list[i];
      list[i] = list[j];
      list[j] = swap;
    }
  }

  function pickSpread(eligible, count, taken, selfR) {
    const pool = eligible.slice();
    const picked = [];
    while (picked.length < count && pool.length) {
      let bestI = -1;
      let bestD = -1;
      for (let i = 0; i < pool.length; i += 1) {
        const peg = pool[i];
        let blocked = false;
        for (const other of taken) {
          if (Math.hypot(other.x - peg.x, other.y - peg.y) < selfR + other.r + 3) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        let nearest = Infinity;
        for (const other of picked) {
          nearest = Math.min(nearest, Math.hypot(other.x - peg.x, other.y - peg.y));
        }
        if (nearest > bestD) {
          bestD = nearest;
          bestI = i;
        }
      }
      if (bestI < 0) break;
      picked.push(pool.splice(bestI, 1)[0]);
    }
    return picked;
  }

  function assignObstacles(pegs, pockets, width) {
    const rad = CFG.flowerR;
    const eligible = pegs.filter((peg) => flowerFits(peg, pockets, width, rad));
    shuffleInPlace(eligible, 'obstaculos');
    const flowerCount = Math.min(eligible.length, Math.round(pegs.length * 0.15));
    for (const peg of pickSpread(eligible, flowerCount, [], rad)) {
      peg.kind = 'flower';
      peg.r = rad;
    }
    const pins = pegs.filter((peg) => peg.kind !== 'flower');
    const smileRad = CFG.smileR;
    const smileEligible = pins.filter((peg) => flowerFits(peg, pockets, width, smileRad));
    shuffleInPlace(smileEligible, 'caritas');
    const smileCount = Math.min(smileEligible.length, Math.round(pins.length * 0.15));
    const flowers = pegs.filter((peg) => peg.kind === 'flower');
    for (const peg of pickSpread(smileEligible, smileCount, flowers, smileRad)) {
      peg.kind = 'smile';
      peg.r = smileRad;
    }
    const stillPins = pegs.filter((peg) => peg.kind !== 'flower' && peg.kind !== 'smile');
    const peaceReach = CFG.peaceR * 1.42;
    const peaceEligible = stillPins.filter((peg) => flowerFits(peg, pockets, width, peaceReach));
    shuffleInPlace(peaceEligible, 'paz');
    const peaceCount = Math.min(peaceEligible.length, Math.round(stillPins.length * 0.1));
    const placed = pegs.filter((peg) => peg.kind === 'flower' || peg.kind === 'smile');
    for (const peg of pickSpread(peaceEligible, peaceCount, placed, peaceReach)) {
      peg.kind = 'peace';
      peg.r = CFG.peaceR;
    }
  }

  function peaceIcon(s) {
    const n = (v) => v.toFixed(2);
    const rays = 16;
    const colors = ['#f6a8c4', '#f47d20', '#e8894a', '#f3b7c8'];
    const inner = s * 1.05;
    const outer = s * 1.42;
    let burst = '';
    for (let i = 0; i < rays; i += 1) {
      const a0 = (i / rays) * Math.PI * 2;
      const a1 = ((i + 0.58) / rays) * Math.PI * 2;
      const p = (ang, rad) => `${n(Math.cos(ang) * rad)} ${n(Math.sin(ang) * rad)}`;
      burst += `<path d="M${p(a0, inner)} L${p(a0, outer)} L${p(a1, outer)} L${p(a1, inner)} Z" fill="${colors[i % colors.length]}" stroke="#3a2418" stroke-width="${n(Math.max(0.45, s * 0.04))}" stroke-linejoin="round"/>`;
    }
    const ring = s * 0.72;
    const arm = `M0 ${n(-ring * 0.68)} V${n(ring * 0.68)} M0 ${n(ring * 0.04)} L${n(-ring * 0.52)} ${n(ring * 0.62)} M0 ${n(ring * 0.04)} L${n(ring * 0.52)} ${n(ring * 0.62)}`;
    return `${burst}
      <circle r="${n(ring + s * 0.1)}" fill="#3a2418"/>
      <circle r="${n(ring)}" fill="#c9962e"/>
      <circle r="${n(ring * 0.74)}" fill="#f4ecd4" stroke="#3a2418" stroke-width="${n(Math.max(0.6, s * 0.05))}"/>
      <path d="${arm}" fill="none" stroke="#3a2418" stroke-width="${n(Math.max(1.5, s * 0.16))}" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${arm}" fill="none" stroke="#c9962e" stroke-width="${n(Math.max(0.9, s * 0.09))}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  function smileIcon(s) {
    const n = (v) => v.toFixed(2);
    return `<circle r="${n(s)}" fill="#c6a36a"/>
      <circle r="${n(s * 0.9)}" fill="#8d6840"/>
      <circle r="${n(s * 0.82)}" fill="#ffe14a"/>
      <ellipse cx="${n(-s * 0.26)}" cy="${n(-s * 0.2)}" rx="${n(s * 0.08)}" ry="${n(s * 0.15)}" fill="#1a120c"/>
      <ellipse cx="${n(s * 0.26)}" cy="${n(-s * 0.2)}" rx="${n(s * 0.08)}" ry="${n(s * 0.15)}" fill="#1a120c"/>
      <path d="M${n(-s * 0.4)} ${n(s * 0.02)} Q0 ${n(s * 0.52)} ${n(s * 0.4)} ${n(s * 0.02)}" fill="none" stroke="#1a120c" stroke-width="${n(Math.max(1.1, s * 0.12))}" stroke-linecap="round"/>`;
  }

  function flowerIcon(s, id) {
    const n = (v) => v.toFixed(2);
    const sw = Math.max(0.7, s * 0.055);
    const colors = ['#f6c56a', '#f47d20', '#ffe08a', '#e45712'];
    const bandW = (s * 0.64) / colors.length;
    let petals = '';
    for (let i = 0; i < 6; i += 1) {
      const clip = `flower-${id}-${i}`;
      const stripes = colors
        .map((color, band) => {
          const x = -s * 0.32 + band * bandW;
          return `<rect x="${n(x)}" y="${n(-s)}" width="${n(bandW + 0.5)}" height="${n(s * 0.62)}" fill="${color}"/>`;
        })
        .join('');
      petals += `<g transform="rotate(${i * 60})">
        <ellipse cx="0" cy="${n(-s * 0.48)}" rx="${n(s * 0.4)}" ry="${n(s * 0.48)}" fill="#ef3d16" stroke="#24140f" stroke-width="${n(sw)}"/>
        <clipPath id="${clip}"><ellipse cx="0" cy="${n(-s * 0.46)}" rx="${n(s * 0.3)}" ry="${n(s * 0.36)}"/></clipPath>
        <g clip-path="url(#${clip})">${stripes}</g>
        <ellipse cx="0" cy="${n(-s * 0.46)}" rx="${n(s * 0.3)}" ry="${n(s * 0.36)}" fill="none" stroke="#24140f" stroke-width="${n(sw * 0.65)}"/>
      </g>`;
    }
    return `${petals}<circle r="${n(s * 0.3)}" fill="#f4b7c9" stroke="#24140f" stroke-width="${n(sw)}"/>`;
  }

  function syncDim(layout, areas) {
    const byId = new Map((areas || []).map((a) => [a.id, a]));
    for (const pocket of layout.pockets) {
      const area = byId.get(pocket.id);
      if (!area) continue;
      pocket.dimmed = !!area.dimmed;
      pocket.nombre = area.nombre || pocket.nombre;
    }
    return layout;
  }

  function pocketAt(layout, id) {
    return layout.pockets.find((p) => p.id === id) || layout.pockets[0];
  }

  function ballHitsPocket(s, p) {
    const r = CFG.ballR - 0.5;
    const left = p.x - p.w / 2;
    const right = p.x + p.w / 2;
    const top = p.y;
    const bot = p.y + p.h;
    const nx = clamp(s.x, left, right);
    const ny = clamp(s.y, top, bot);
    const dx = s.x - nx;
    const dy = s.y - ny;
    return dx * dx + dy * dy < r * r;
  }

  function hitsForeignPocket(samples, layout, winner, allowWinner) {
    for (const s of samples) {
      for (const p of layout.pockets) {
        if (!ballHitsPocket(s, p)) continue;
        if (allowWinner && p.id === winner.id) continue;
        return true;
      }
    }
    return false;
  }

  function sampleHop(x0, y0, x1, y1, rot0, rng, g, maxRise) {
    const dy = y1 - y0;
    const dx = x1 - x0;
    const tFloor = Math.sqrt(Math.max(0, (2 * Math.max(dy, 0)) / g)) + 0.04;
    const lob = rng() < 0.18;
    const extra = lob ? 0.26 + rng() * 0.22 : Math.pow(rng(), 1.35) * 0.24 + 0.05;
    let t = clamp(tFloor + extra, 0.16, 0.72);
    let vy0 = (dy - 0.5 * g * t * t) / t;
    const cap = maxRise == null ? 72 : maxRise;
    let guard = 0;
    while (vy0 < 0 && (vy0 * vy0) / (2 * g) > cap && guard < 6) {
      t = Math.max(tFloor + 0.02, t * 0.8);
      vy0 = (dy - 0.5 * g * t * t) / t;
      guard++;
    }
    const vx = dx / t;
    const steps = Math.max(5, Math.round(t / CFG.dt));
    const samples = [];
    let rot = rot0;
    for (let i = 1; i <= steps; i++) {
      const u = (i / steps) * t;
      const x = x0 + vx * u;
      const y = y0 + vy0 * u + 0.5 * g * u * u;
      rot += vx * CFG.dt * 2.4;
      samples.push({ x, y, rot, vx, vy: vy0 + g * u });
    }
    return { samples, t, vx, vy0, rot };
  }

  function channelsFor(pockets, width) {
    const sorted = pockets.slice().sort((a, b) => a.x - b.x);
    const pad = CFG.ballR + 4;
    const out = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i].x + sorted[i].w / 2 + pad;
      const b = sorted[i + 1].x - sorted[i + 1].w / 2 - pad;
      if (b - a >= 8) out.push({ x0: a, x1: b, mid: (a + b) / 2 });
    }
    const left = CFG.margin + pad;
    const right = width - CFG.margin - pad;
    if (sorted.length) {
      const before = sorted[0].x - sorted[0].w / 2 - pad;
      if (before - left >= 8) out.unshift({ x0: left, x1: before, mid: (left + before) / 2 });
      const after = sorted[sorted.length - 1].x + sorted[sorted.length - 1].w / 2 + pad;
      if (right - after >= 8) out.push({ x0: after, x1: right, mid: (after + right) / 2 });
    }
    return out;
  }

  function nearestChannel(list, x) {
    if (!list.length) return null;
    let best = list[0];
    let bestD = Math.abs(best.mid - x);
    for (const channel of list) {
      const dist = Math.abs(channel.mid - x);
      if (dist < bestD) {
        best = channel;
        bestD = dist;
      }
    }
    return best;
  }

  function pickSidePeg(x, y, yMax, layout, rng, used, aimX) {
    const pool = [];
    for (const peg of layout.pegs) {
      if (used && used.has(peg.i) && rng() < 0.82) continue;
      const dy = peg.y - y;
      if (dy < 22 || dy > 68 || peg.y > yMax - 4) continue;
      const score = Math.abs(peg.x - aimX) * 0.85 + Math.abs(dy - 40) * 0.25 + rng() * 28;
      pool.push({ peg, score });
    }
    if (!pool.length) return [];
    pool.sort((a, b) => a.score - b.score);
    return pool.slice(0, Math.min(4, pool.length)).map((item) => item.peg);
  }

  function contactOnPeg(fromX, fromY, peg) {
    let dx = fromX - peg.x;
    let dy = fromY - peg.y;
    if (dy > -4) dy = -Math.abs(dx) * 0.35 - 8;
    const dist = Math.hypot(dx, dy) || 1;
    const min = CFG.ballR + peg.r;
    return {
      x: peg.x + (dx / dist) * min,
      y: peg.y + (dy / dist) * min,
      peg,
    };
  }

  function hopOk(samples, layout, winner, allowWinner) {
    if (!samples.length) return false;
    for (const s of samples) {
      if (s.x < CFG.ballR || s.x > layout.width - CFG.ballR) return false;
      if (s.y < -30) return false;
    }
    return !hitsForeignPocket(samples, layout, winner, allowWinner);
  }

  function settleSamples(x, y, rot, rng) {
    const samples = [];
    const base = y;
    const frames = 42;
    for (let i = 1; i <= frames; i++) {
      const t = i / frames;
      const amp = (1 - t) * (7 + rng() * 4);
      const wave = Math.sin(t * Math.PI * 2.15) * amp;
      rot += (rng() - 0.5) * 4;
      samples.push({ x, y: base - Math.max(0, wave), rot, vx: 0, vy: 0 });
    }
    return samples;
  }

  function lineHop(x0, y0, x1, y1, rot0) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.ceil(dist / 5));
    const samples = [];
    let rot = rot0;
    const vx = x1 - x0;
    const vy = y1 - y0;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      rot += vx * 0.02;
      samples.push({
        x: x0 + (x1 - x0) * t,
        y: y0 + (y1 - y0) * t,
        rot,
        vx,
        vy,
      });
    }
    return { samples, rot };
  }

  function weaveDown(layout, winner, rng, samples, hits) {
    const g = CFG.gravity;
    const used = new Set();
    let x = layout.width / 2 + (rng() - 0.5) * 28;
    let y = 34;
    let rot = (rng() - 0.5) * 20;
    let incomingVx = rng() < 0.5 ? -140 : 140;
    let hops = 0;
    const hold = 10 + Math.floor(rng() * 8);
    for (let i = 0; i < hold; i++) samples.push({ x, y, rot, vx: 0, vy: 0 });

    const rows = [];
    for (const pocket of layout.pockets) {
      if (!rows.includes(pocket.row)) rows.push(pocket.row);
    }
    rows.sort((a, b) => a - b);

    function riseCap(atY) {
      let cap = atY < CFG.firstPocketY - 20 ? 58 : 14;
      for (const pocket of layout.pockets) {
        const floor = pocket.y + pocket.h + CFG.ballR + 6;
        if (floor < atY - 4) cap = Math.min(cap, Math.max(8, atY - floor));
      }
      return cap;
    }

    function pegNear(px, py) {
      let best = null;
      let bestD = 82;
      for (const peg of layout.pegs) {
        const dist = Math.hypot(peg.x - px, peg.y - py);
        if (dist < bestD) {
          bestD = dist;
          best = peg.i;
        }
      }
      return best;
    }

    function pushHop(hop, pegIndex) {
      const base = samples.length;
      samples.push(...hop.samples);
      if (pegIndex != null) hits.push({ i: base + hop.samples.length - 1, peg: pegIndex });
      const end = hop.samples[hop.samples.length - 1];
      incomingVx = end.vx || incomingVx;
      x = end.x;
      y = end.y;
      rot = hop.rot;
    }

    function commit(x1, y1, allowWinner, maxRise) {
      const nx = clamp(x1, CFG.ballR + 2, layout.width - CFG.ballR - 2);
      const ny = y1;
      if (Math.hypot(nx - x, ny - y) < 1.2) return true;
      if (Math.hypot(nx - x, ny - y) > 110) {
        return commit((x + nx) / 2, (y + ny) / 2, allowWinner, maxRise) && commit(nx, ny, allowWinner, maxRise);
      }
      const arc = sampleHop(x, y, nx, ny, rot, rng, g, maxRise);
      if (hopOk(arc.samples, layout, winner, allowWinner)) {
        pushHop(arc, pegNear(nx, ny));
        return true;
      }
      const line = lineHop(x, y, nx, ny, rot);
      if (hopOk(line.samples, layout, winner, allowWinner)) {
        pushHop(line, pegNear(nx, ny));
        return true;
      }
      return false;
    }

    function bouncePeg(peg, allowWinner, maxRise) {
      const hit = contactOnPeg(x, y, peg);
      if (hit.y < y + 8) return false;
      const hop = sampleHop(x, y, hit.x, hit.y, rot, rng, g, maxRise);
      if (!hopOk(hop.samples, layout, winner, allowWinner)) return false;
      used.add(peg.i);
      pushHop(hop, peg.i);
      hops++;
      return true;
    }

    function lateral(goalX, yLimit) {
      const y0 = y;
      const x0 = x;
      const span = yLimit - y0;
      if (span < 12) {
        if (Math.abs(x - goalX) > 6) commit(goalX, y, false, riseCap(y));
        return;
      }
      const n = span > 170 ? 4 : span > 95 ? 3 : 2;
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        const guide = x0 + (goalX - x0) * u;
        const swing =
          i === n
            ? 0
            : (1 - u * 0.4) * (n >= 4 ? layout.width * 0.2 : layout.width * 0.13) * (0.85 + rng() * 0.3);
        const side = i % 2 === 0 ? 1 : -1;
        const aim =
          i === n
            ? goalX
            : clamp(guide + side * swing, CFG.margin + 18, layout.width - CFG.margin - 18);
        const ny = y0 + span * u;
        const pegs = pickSidePeg(x, y, ny + 20, layout, rng, used, aim);
        let bounced = false;
        for (const peg of pegs) {
          if (Math.abs(peg.x - aim) > 64 || Math.abs(peg.x - x) < 42) continue;
          if (bouncePeg(peg, false, riseCap(y))) {
            bounced = true;
            break;
          }
        }
        if (Math.abs(x - aim) > 24 || !bounced) commit(aim, Math.max(ny, y + 6), false, riseCap(y));
      }
      if (Math.abs(x - goalX) > 8) commit(goalX, Math.max(yLimit, y), false, riseCap(y));
    }

    function descend(x0, x1, yTo, allowWinner) {
      const left = Math.min(x0, x1);
      const right = Math.max(x0, x1);
      const mid = (left + right) / 2;
      if (right - left < 10) {
        commit(mid, yTo, allowWinner, 8);
        return;
      }
      if (x < left || x > right) commit(mid, y, false, riseCap(y));
      let toRight = x <= mid;
      let guard = 0;
      while (y < yTo - 12 && guard < 7) {
        guard++;
        const ny = Math.min(yTo, y + 24 + rng() * 20);
        const nx = clamp(toRight ? right - 1 : left + 1, left, right);
        if (!commit(nx, ny, allowWinner, 8)) {
          if (!commit(clamp(x, left, right), ny, allowWinner, 6)) break;
        }
        toRight = !toRight;
      }
      commit(allowWinner ? clamp(winner.x, left, right) : mid, yTo, allowWinner, 8);
    }

    for (const row of rows) {
      if (row > winner.row) break;
      const rowPockets = layout.pockets.filter((pocket) => pocket.row === row);
      let top = rowPockets[0].y;
      let bottom = rowPockets[0].y + rowPockets[0].h;
      for (const pocket of rowPockets) {
        if (pocket.y < top) top = pocket.y;
        if (pocket.y + pocket.h > bottom) bottom = pocket.y + pocket.h;
      }
      const laneY = top - CFG.ballR - 18;
      const belowY = bottom + CFG.ballR + 14;
      const channels = channelsFor(rowPockets, layout.width);
      let goalX = winner.x;
      if (row !== winner.row && channels.length) {
        const lastGap = winner.row - 1;
        const left = CFG.margin + 24;
        const right = layout.width - CFG.margin - 24;
        const opposite = Math.abs(winner.x - left) > Math.abs(winner.x - right) ? left : right;
        const beside = opposite === left ? right : left;
        let target = winner.x;
        if (lastGap > 1 && row < lastGap) {
          const u = row / lastGap;
          const edge = row % 2 === 0 ? opposite : beside;
          const pull = u * 0.75;
          target = edge * (1 - pull) + winner.x * pull;
        }
        const channel = nearestChannel(channels, target + (rng() - 0.5) * 12);
        goalX = channel.mid;
      }

      lateral(goalX, laneY);

      if (row === winner.row) {
        const half = Math.max(5, winner.mouth / 2 - CFG.ballR - 1);
        descend(winner.x - half, winner.x + half, winner.y + CFG.ballR + 8, true);
        break;
      }
      const channel = nearestChannel(channels, goalX) || channels[0];
      if (channel) descend(channel.x0, channel.x1, belowY, false);
      else commit(goalX, belowY, false, 10);
    }

    const restY = winner.y + CFG.ballR + 8;
    if (Math.abs(x - winner.x) > 8 || y < winner.y + 4) {
      const laneY = winner.y - CFG.ballR - 18;
      if (y < laneY) lateral(winner.x, laneY);
      descend(
        winner.x - Math.max(5, winner.mouth / 2 - CFG.ballR - 1),
        winner.x + Math.max(5, winner.mouth / 2 - CFG.ballR - 1),
        restY,
        true
      );
    }
    return { rot, hops };
  }

  function planDrop(layout, winnerId, seed) {
    const winner = pocketAt(layout, winnerId);
    const numeric = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
    const rng = mulberry32(numeric || 1);
    const samples = [];
    const hits = [];
    const woven = weaveDown(layout, winner, rng, samples, hits);
    samples.push(...settleSamples(winner.x, winner.y + CFG.ballR + 8, woven.rot, rng));

    let crossed = false;
    for (const s of samples) {
      if (!crossed && s.y >= winner.y - 2 && Math.abs(s.x - winner.x) < winner.mouth / 2) crossed = true;
    }

    return {
      samples,
      hits,
      dt: CFG.dt,
      winnerId: winner.id,
      crossed,
      hops: woven.hops,
    };
  }

  function applyCamera(world, cam, scale, offsetX) {
    world.style.transform = `translate(${offsetX}px, ${-cam * scale}px) scale(${scale})`;
  }

  function pocketLights(w, h) {
    const insetX = 7;
    const insetY = 7;
    const innerW = Math.max(20, w - insetX * 2);
    const innerH = Math.max(16, h - insetY * 2);
    const topN = Math.max(3, Math.round(innerW / 16));
    const sideN = innerH >= 52 ? 2 : innerH >= 36 ? 1 : 0;
    const pts = [];
    const push = (x, y) => pts.push([x, y]);
    for (let k = 0; k < topN; k += 1) push(insetX + (innerW * k) / (topN - 1), insetY);
    for (let k = 1; k <= sideN; k += 1) push(w - insetX, insetY + (innerH * k) / (sideN + 1));
    for (let k = topN - 2; k >= 1; k -= 1) push(insetX + (innerW * k) / (topN - 1), h - insetY);
    for (let k = sideN; k >= 1; k -= 1) push(insetX, insetY + (innerH * k) / (sideN + 1));
    return pts
      .map((pt, i) => `<i class="bulb" style="left:${pt[0].toFixed(1)}px;top:${pt[1].toFixed(1)}px;animation-delay:${(-i * 0.11).toFixed(2)}s"></i>`)
      .join('');
  }

  function pocketArch() {
    return `<svg class="pocket-arch" viewBox="0 0 80 44" aria-hidden="true">
      <path d="M4 42 A36 36 0 0 1 76 42" fill="none" stroke="#3a1810" stroke-width="8" stroke-linecap="round"/>
      <path d="M6 42 A34 34 0 0 1 74 42" fill="none" stroke="#e45712" stroke-width="6" stroke-linecap="round"/>
      <path d="M14 42 A26 26 0 0 1 66 42" fill="none" stroke="#f6c14a" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M22 42 A18 18 0 0 1 58 42" fill="none" stroke="#9a2460" stroke-width="5" stroke-linecap="round"/>
      <path d="M29 42 A11 11 0 0 1 51 42" fill="none" stroke="#f47d20" stroke-width="4.5" stroke-linecap="round"/>
    </svg>`;
  }

  function render(layout) {
    const pegs = layout.pegs
      .map((p) => {
        if (!p.kind || p.kind === 'peg') {
          return `<circle class="plinko-peg" data-peg="${p.i}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r.toFixed(2)}"/>`;
        }
        if (p.kind === 'smile') {
          return `<g class="plinko-peg plinko-mark peg-smile" data-peg="${p.i}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">${smileIcon(p.r)}</g>`;
        }
        if (p.kind === 'peace') {
          return `<g class="plinko-peg plinko-mark peg-peace" data-peg="${p.i}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">${peaceIcon(p.r)}</g>`;
        }
        const sway = (2.4 + (hashString('sway' + p.i) % 180) / 100).toFixed(2);
        const delay = ((hashString('delay' + p.i) % 180) / 100).toFixed(2);
        return `<g class="plinko-peg plinko-mark peg-flower" data-peg="${p.i}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"><g class="peg-spin" style="animation-duration:${sway}s;animation-delay:-${delay}s">${flowerIcon(p.r, p.i)}</g></g>`;
      })
      .join('');
    const pockets = layout.pockets
      .map((p) => {
        const cls = p.dimmed ? 'plinko-pocket is-dim' : 'plinko-pocket';
        return `<div class="${cls}" data-id="${escapeHtml(p.id)}" style="left:${(p.x - p.w / 2).toFixed(1)}px;top:${p.y.toFixed(1)}px;width:${p.w.toFixed(1)}px;height:${p.h}px" title="${escapeHtml(p.nombre)}">${pocketArch()}${pocketLights(p.w, p.h)}<span>${escapeHtml(p.nombre)}</span></div>`;
      })
      .join('');
    const mid = layout.width / 2;
    return `
      <div class="plinko-world" style="width:${layout.width}px;height:${layout.height}px">
        <svg class="plinko-svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">
          <defs>
            <radialGradient id="plinkoPeg" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stop-color="#fff6df"/>
              <stop offset="38%" stop-color="#d9dde6"/>
              <stop offset="72%" stop-color="#8d93a3"/>
              <stop offset="100%" stop-color="#4c5160"/>
            </radialGradient>
            <linearGradient id="plinkoRail" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#ffe5b8"/>
              <stop offset="40%" stop-color="#e7a15a"/>
              <stop offset="100%" stop-color="#a85a22"/>
            </linearGradient>
          </defs>
          <rect x="8" y="8" width="${layout.width - 16}" height="${layout.height - 16}" rx="18" fill="none" stroke="url(#plinkoRail)" stroke-width="3" opacity="0.85"/>
          <path d="M${mid - 34} 8 L${mid - 16} 42 L${mid + 16} 42 L${mid + 34} 8" fill="none" stroke="#ffc354" stroke-width="3" stroke-linejoin="round"/>
          ${pegs}
        </svg>
        ${pockets}
        <div class="plinko-trail" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="plinko-ball" aria-hidden="true"><i></i></div>
      </div>
    `;
  }

  function play(host, opts) {
    const options = opts || {};
    const areas = options.areas || [];
    const winnerId = options.winnerId;
    if (host._plinkoStop) host._plinkoStop();

    return new Promise((resolve) => {
      let stopped = false;
      let settled = false;
      let ticker = null;
      const camState = { y: 0 };
      const stop = () => {
        stopped = true;
      };
      host._plinkoStop = stop;

      const finish = (payload) => {
        if (settled) return;
        settled = true;
        if (ticker) gsap.ticker.remove(ticker);
        gsap.killTweensOf(camState);
        if (host._plinkoStop === stop) host._plinkoStop = null;
        resolve(payload);
      };

      const boardW = host.clientWidth || options.boardWidth || 880;
      let layout = options.layout;
      const ids = areas
        .map((a) => a.id)
        .slice()
        .sort()
        .join('|');
      if (!layout || layout._key !== ids) {
        layout = layoutBoard(areas, boardW);
        layout._key = ids;
      } else {
        syncDim(layout, areas);
      }

      const plan = planDrop(layout, winnerId, options.seed || winnerId || 'area');
      host.innerHTML = render(layout);
      const slot = host.querySelector(`.plinko-pocket[data-id="${CSS.escape(String(plan.winnerId))}"]`);
      if (slot) slot.classList.add('is-slot');
      const world = host.querySelector('.plinko-world');
      const ball = host.querySelector('.plinko-ball');
      const trailBox = host.querySelector('.plinko-trail');
      const winnerPocket = pocketAt(layout, plan.winnerId);
      let tucked = false;
      function tuckBehind(sample) {
        if (tucked || !winnerPocket) return;
        const insideX = Math.abs(sample.x - winnerPocket.x) < winnerPocket.w / 2 - 2;
        const intoSign = sample.y > winnerPocket.y + 4;
        if (!insideX || !intoSign) return;
        tucked = true;
        ball.classList.add('is-behind');
        if (trailBox) trailBox.classList.add('is-behind');
        const node = host.querySelector(`.plinko-pocket[data-id="${CSS.escape(String(winnerPocket.id))}"]`);
        if (node) node.classList.add('is-win');
      }
      const shine = ball.querySelector('i');
      const trailNodes = host.querySelectorAll('.plinko-trail i');
      const trail = [];
      const pegNodes = host.querySelectorAll('.plinko-peg');
      world.style.transformOrigin = 'top left';
      let scale = 1;
      let offsetX = 0;
      let viewVirtual = 640;
      let needsCamera = false;
      let cam = 0;

      function fit() {
        const viewW = host.clientWidth || layout.width;
        const viewH = host.clientHeight || 640;
        scale = viewW / layout.width || 1;
        offsetX = Math.max(0, (viewW - layout.width * scale) / 2);
        viewVirtual = viewH / scale;
        needsCamera = layout.height > viewVirtual + 12;
      }

      function targetCam(ballY) {
        if (!needsCamera) return 0;
        const desired = ballY - viewVirtual * 0.4;
        return clamp(desired, 0, Math.max(0, layout.height - viewVirtual));
      }

      function placeBall(s) {
        const r = CFG.ballR;
        ball.style.width = r * 2 + 'px';
        ball.style.height = r * 2 + 'px';
        ball.style.transform = `translate(${s.x - r}px, ${s.y - r}px) rotate(${s.rot}deg)`;
        shine.style.transform = `rotate(${-s.rot}deg)`;
        trail.push(s);
        if (trail.length > trailNodes.length) trail.shift();
        for (let i = 0; i < trailNodes.length; i++) {
          const point = trail[trail.length - 1 - i];
          const node = trailNodes[i];
          if (!point) {
            node.style.opacity = '0';
            continue;
          }
          node.style.opacity = String(0.42 - i * 0.07);
          node.style.transform = `translate(${point.x}px, ${point.y}px)`;
        }
      }

      fit();
      applyCamera(world, 0, scale, offsetX);
      placeBall(plan.samples[0]);

      const dt = plan.dt;
      const simT = Math.max(dt, (plan.samples.length - 1) * dt);
      const desired = clamp(3.5 + layout.rows * 0.34, 4.1, 8.1);
      const rate = clamp(simT / desired, 0.94, 1.45);
      let elapsed = 0;
      let hitCursor = 0;
      let arrived = false;

      function flash(index) {
        const node = pegNodes[index];
        if (!node) return;
        node.classList.add('is-hot');
        ball.classList.add('is-spark');
        gsap.delayedCall(0.34, () => {
          node.classList.remove('is-hot');
          ball.classList.remove('is-spark');
        });
      }

      function centerOnPocket() {
        fit();
        const pocket = pocketAt(layout, plan.winnerId);
        const node = host.querySelector(`.plinko-pocket[data-id="${CSS.escape(String(pocket.id))}"]`);
        if (node) node.classList.add('is-win');
        if (options.onArrive) options.onArrive(pocket);
        const dest = needsCamera
          ? clamp(pocket.y + pocket.h / 2 - viewVirtual * 0.42, 0, Math.max(0, layout.height - viewVirtual))
          : 0;
        camState.y = cam;
        gsap.to(camState, {
          y: dest,
          duration: needsCamera ? 0.9 : 0.35,
          ease: 'power2.inOut',
          onUpdate: () => {
            if (stopped || (options.shouldAbort && options.shouldAbort())) {
              finish({ aborted: true, layout });
              return;
            }
            fit();
            cam = camState.y;
            applyCamera(world, cam, scale, offsetX);
          },
          onComplete: () => finish({ aborted: false, layout, pocket }),
        });
      }

      ticker = function tick(_time, deltaMs) {
        if (stopped || (options.shouldAbort && options.shouldAbort())) {
          finish({ aborted: true, layout });
          return;
        }
        const delta = Math.min(0.05, (deltaMs || 16) / 1000);
        elapsed += delta * rate;
        let idx = Math.floor(elapsed / dt);
        if (idx >= plan.samples.length - 1) {
          if (!arrived) {
            arrived = true;
            const last = plan.samples[plan.samples.length - 1];
            placeBall(last);
            tuckBehind(last);
            gsap.ticker.remove(ticker);
            ticker = null;
            centerOnPocket();
          }
          return;
        }
        const frac = elapsed / dt - idx;
        const a = plan.samples[idx];
        const b = plan.samples[idx + 1];
        const sample = {
          x: a.x + (b.x - a.x) * frac,
          y: a.y + (b.y - a.y) * frac,
          rot: a.rot + (b.rot - a.rot) * frac,
        };
        placeBall(sample);
        tuckBehind(sample);
        fit();
        const follow = targetCam(sample.y);
        cam += (follow - cam) * (1 - Math.exp(-5.5 * delta));
        applyCamera(world, cam, scale, offsetX);
        while (hitCursor < plan.hits.length && plan.hits[hitCursor].i <= idx) {
          flash(plan.hits[hitCursor].peg);
          hitCursor++;
        }
      };

      gsap.ticker.add(ticker);
    });
  }

  const api = { layoutBoard, planDrop, play, syncDim, hashString };
  if (typeof window !== 'undefined') window.PlinkoAnim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

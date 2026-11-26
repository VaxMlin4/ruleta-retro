'use strict';

const { layoutBoard, planDrop } = require('../public/js/animations/plinko.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  ✓', msg);
  } else {
    failed++;
    console.error('  ✗', msg);
  }
}

function areas(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `A${String(i).padStart(2, '0')}`,
      nombre: i % 5 === 0 ? `Atención a Clientes ${i}` : `Área ${i + 1}`,
      dimmed: i % 7 === 0,
    });
  }
  return out;
}

function rectsOverlap(a, b) {
  return a.x - a.w / 2 < b.x + b.w / 2 - 1 && a.x + a.w / 2 > b.x - b.w / 2 + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1;
}

function trespass(samples, layout, winnerId) {
  const r = 11;
  let hits = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const prev = samples[Math.max(0, i - 1)];
    for (const p of layout.pockets) {
      if (p.id === winnerId) continue;
      const left = p.x - p.w / 2;
      const right = p.x + p.w / 2;
      const nx = Math.max(left, Math.min(s.x, right));
      const ny = Math.max(p.y, Math.min(s.y, p.y + p.h));
      const dx = s.x - nx;
      const dy = s.y - ny;
      if (dx * dx + dy * dy < r * r) hits++;
      const mx = (s.x + prev.x) / 2;
      const my = (s.y + prev.y) / 2;
      const nx2 = Math.max(left, Math.min(mx, right));
      const ny2 = Math.max(p.y, Math.min(my, p.y + p.h));
      const dx2 = mx - nx2;
      const dy2 = my - ny2;
      if (dx2 * dx2 + dy2 * dy2 < r * r) hits++;
    }
  }
  return hits;
}

function alternation(plan) {
  const signs = [];
  for (const hit of plan.hits) {
    const s = plan.samples[Math.max(0, hit.i - 2)];
    if (!s || Math.abs(s.vx) < 15) continue;
    signs.push(Math.sign(s.vx));
  }
  if (signs.length < 4) return 0;
  let flips = 0;
  for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) flips++;
  return flips / (signs.length - 1);
}

function runCount(n) {
  const list = areas(n);
  const layout = layoutBoard(list, 960);
  assert(layout.pockets.length === n, `${n} compartimentos`);
  let overlap = 0;
  for (let i = 0; i < layout.pockets.length; i++) {
    for (let j = i + 1; j < layout.pockets.length; j++) {
      if (rectsOverlap(layout.pockets[i], layout.pockets[j])) overlap++;
    }
  }
  assert(overlap === 0, `${n} áreas sin compartimentos encimados`);
  const minGap = Math.min(
    ...layout.pockets.map((p) => p.w)
  );
  assert(minGap >= 96, `${n} áreas: ancho de compartimento ${minGap.toFixed(0)}px`);

  const frozen = layoutBoard(list.map((a) => ({ ...a, dimmed: !a.dimmed })), 960);
  const moved = layout.pockets.some((p, i) => {
    const q = frozen.pockets.find((x) => x.id === p.id);
    return !q || Math.abs(q.x - p.x) > 0.1 || Math.abs(q.y - p.y) > 0.1;
  });
  assert(!moved, `${n} áreas: atenuar no mueve el tablero`);

  const winners = [0, Math.floor(n / 3), Math.floor(n / 2), n - 1];
  for (const index of winners) {
    const id = layout.pockets[index].id;
    const plan = planDrop(layout, id, `sorteo-${n}-${id}`);
    const last = plan.samples[plan.samples.length - 1];
    const pocket = layout.pockets[index];
    const inside =
      Math.abs(last.x - pocket.x) < 10 && last.y > pocket.y && last.y < pocket.y + pocket.h + 8;
    const bad = trespass(plan.samples, layout, id);
    assert(inside, `${n} áreas → ${pocket.nombre} termina en su compartimento`);
    assert(bad === 0, `${n} áreas → ${id} no traspasa otras áreas (${bad})`);
    const alt = alternation(plan);
    assert(alt >= 0.15 && alt <= 1, `${n} áreas rebote irregular (${alt.toFixed(2)})`);
    const chuteLimit = layout.pockets[0].y - 36;
    let minX = Infinity;
    let maxX = -Infinity;
    let flips = 0;
    let prevSign = 0;
    for (let i = 1; i < plan.samples.length; i++) {
      const s = plan.samples[i];
      if (s.y > chuteLimit) break;
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x);
      const dx = s.x - plan.samples[i - 1].x;
      if (Math.abs(dx) < 0.35) continue;
      const sign = Math.sign(dx);
      if (prevSign && sign !== prevSign) flips++;
      prevSign = sign;
    }
    assert(maxX - minX >= 140 && flips >= 2, `${n} áreas baja de lado desde el inicio (${(maxX - minX).toFixed(0)}px, ${flips} cambios)`);
    assert(plan.samples.length > 40, `${n} áreas tiene recorrido (${plan.samples.length} frames)`);
  }

  const tall = layout.height > 760;
  if (n <= 6) assert(!tall || layout.height < 820, `${n} áreas cabe en un escenario corto (${layout.height}px)`);
  if (n >= 30) assert(layout.height > 1000, `${n} áreas extiende el escenario (${layout.height}px)`);
  console.log(`    layout ${n}: ${layout.cols} cols × ${layout.rows} filas, alto ${layout.height}px, pegs ${layout.pegs.length}`);
}

console.log('\n=== test-plinko ===\n');
for (const n of [6, 12, 24, 32, 40]) runCount(n);

const replayA = planDrop(layoutBoard(areas(12), 960), 'A05', 'mismo');
const replayB = planDrop(layoutBoard(areas(12), 960), 'A05', 'mismo');
assert(
  replayA.samples.length === replayB.samples.length &&
    Math.abs(replayA.samples[80].x - replayB.samples[80].x) < 0.001,
  'El mismo sorteo repite el mismo recorrido'
);

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);

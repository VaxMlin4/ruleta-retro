'use strict';

/**
 * Pruebas unitarias del motor (sin UI).
 * Usa DB temporal.
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const TEST_DB = path.join(DATA, 'test-engine.sqlite');

// Isolate DB before requiring modules
fs.mkdirSync(DATA, { recursive: true });
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
process.env.RULETA_DB = TEST_DB;

// Patch db path via monkey — our db.js uses fixed path; swap file
const realDb = path.join(DATA, 'ruleta.sqlite');
const backup = realDb + '.bak-test';
if (fs.existsSync(realDb)) fs.renameSync(realDb, backup);
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

const { getDb, getActiveEventId, getEvent } = require('../server/db');
const { importEmpleados, importPremios } = require('../server/services/importExcel');
const { assessViability, applyCuotaOnStart } = require('../server/services/sistemasQuota');
const { executeDraw, releaseAnimationLock, getSorteoById } = require('../server/services/drawEngine');
const ExcelJS = require('exceljs');

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

async function bufferFromRows(headers, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('S');
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function main() {
  console.log('\n=== test-engine ===\n');
  getDb();

  // Build sample data
  const empRows = [];
  for (let i = 1; i <= 8; i++) empRows.push([`S${i}`, `Sis Persona ${i}`, 'Sistemas']);
  for (let i = 1; i <= 20; i++) empRows.push([`V${i}`, `Ventas Persona ${i}`, 'Ventas']);
  for (let i = 1; i <= 10; i++) empRows.push([`F${i}`, `Fin Persona ${i}`, 'Finanzas']);

  const empBuf = await bufferFromRows(['ID', 'Nombre', 'Área'], empRows);
  const premBuf = await bufferFromRows(
    ['ID', 'Artículo', 'Cantidad'],
    [
      ['P1', 'Bocinas', 3],
      ['P2', 'Cafeteras', 2],
      ['P3', 'Audífonos', 5],
    ]
  );

  const r1 = await importEmpleados(empBuf);
  assert(r1.ok, 'Import colaboradores OK');
  assert(r1.participantes === 38, `38 participantes (got ${r1.participantes})`);

  const r2 = await importPremios(premBuf);
  assert(r2.ok, 'Import premios OK');
  assert(r2.unidadesPremios === 10, `10 unidades (got ${r2.unidadesPremios})`);

  const v = assessViability({ chooseCuota: true });
  assert(v.ok, 'Viabilidad OK');
  assert(v.cuota === 4 || v.cuota === 5, `Cuota Sistemas 4 o 5 (got ${v.cuota})`);

  const start = applyCuotaOnStart(getActiveEventId());
  assert(start.ok, 'Inicio evento OK');
  assert(getEvent().estado === 'en_curso', 'Estado en_curso');

  const ids = new Set();
  const sistemasWinners = [];
  for (let i = 0; i < 10; i++) {
    const d = executeDraw();
    assert(d.ok, `Draw ${i + 1} OK`);
    assert(!ids.has(d.empleado.id), `Colaborador único ${d.empleado.id}`);
    ids.add(d.empleado.id);
    if (d.area.esSistemas) sistemasWinners.push(d.empleado.id);
    // Replay must return same
    const replay = getSorteoById(d.sorteoId);
    assert(replay.empleado.id === d.empleado.id, `Replay colaborador draw ${i + 1}`);
    assert(replay.premio.id === d.premio.id, `Replay premio draw ${i + 1}`);
    releaseAnimationLock();
  }

  const event = getEvent();
  assert(
    event.sistemas_ganadores <= event.sistemas_cuota_objetivo,
    `Sistemas ganadores ${event.sistemas_ganadores} ≤ cuota ${event.sistemas_cuota_objetivo}`
  );
  assert(event.estado === 'finalizado' || event.estado === 'en_curso', 'Estado tras agotar');

  // Double-draw lock test on fresh — already finished; try start again N/A
  // Candado: if animacion still on, draw fails
  // Re-import not allowed in en_curso/finalizado
  const bad = await importEmpleados(empBuf);
  assert(!bad.ok, 'Import bloqueado tras evento iniciado/finalizado');

  console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);

  // restore
  try {
    if (fs.existsSync(realDb)) fs.unlinkSync(realDb);
  } catch (_) {}
  if (fs.existsSync(backup)) fs.renameSync(backup, realDb);

  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  if (fs.existsSync(backup) && !fs.existsSync(realDb)) fs.renameSync(backup, realDb);
  process.exit(1);
});

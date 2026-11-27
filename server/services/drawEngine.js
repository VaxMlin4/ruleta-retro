'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb, getActiveEventId, getEvent, runTransaction } = require('../db');

function weightedPick(items, weightFn) {
  const weights = items.map(weightFn);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) throw new Error('Peso total cero al seleccionar.');
  let r = crypto.randomInt(0, total);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

function uniformPick(items) {
  if (!items.length) throw new Error('Lista vacía al seleccionar.');
  return items[crypto.randomInt(0, items.length)];
}

function loadPools(event) {
  const db = getDb();
  const premios = db
    .prepare('SELECT * FROM premios WHERE cantidad_disponible > 0 ORDER BY nombre')
    .all();
  if (!premios.length) throw new Error('No hay premios disponibles.');

  const areas = db
    .prepare(
      `SELECT a.*, COUNT(e.id) AS elegibles
       FROM areas a
       INNER JOIN empleados e ON e.area_id = a.id AND e.elegible = 1
       GROUP BY a.id
       HAVING elegibles > 0`
    )
    .all();

  let eligibleAreas = areas;
  if (event.sistemas_cuota_objetivo != null && event.sistemas_cuota_objetivo > 0) {
    eligibleAreas = areas.filter((a) => {
      if (!a.es_sistemas) return true;
      return (event.sistemas_ganadores || 0) < event.sistemas_cuota_objetivo;
    });
  }
  if (!eligibleAreas.length) throw new Error('No hay áreas elegibles (cuota Sistemas de Información u otras).');

  return { premios, areas: eligibleAreas };
}

const BATCH_COLORS = ['#FFC354', '#F47D20', '#912C70'];

function pickPrizeAreaEmployeePreview(event, options = {}) {
  const exclude = new Set(options.excludeAreaIds || []);
  const loaded = loadPools(event);
  let areas = loaded.areas;
  if (exclude.size) {
    const filtered = areas.filter((a) => !exclude.has(a.id));
    if (!filtered.length) {
      if (options.requireDistinctArea) return null;
    } else {
      areas = filtered;
    }
  }
  if (!areas.length) {
    if (options.requireDistinctArea) return null;
    throw new Error('No hay áreas elegibles (cuota Sistemas de Información u otras).');
  }
  const premio = weightedPick(loaded.premios, (p) => p.cantidad_disponible);
  const area = weightedPick(areas, (a) => a.elegibles);
  const empleados = getDb()
    .prepare('SELECT * FROM empleados WHERE area_id = ? AND elegible = 1')
    .all(area.id);
  const empleado = uniformPick(empleados);
  return { premio, area, empleado };
}

function saveLote(db, ids) {
  db.prepare(
    `INSERT INTO meta (clave, valor) VALUES ('lote_actual', ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  ).run(JSON.stringify(ids));
}

function clearLote(db) {
  db.prepare(`DELETE FROM meta WHERE clave = 'lote_actual'`).run();
}

function readCurrentLote() {
  const db = getDb();
  const row = db.prepare(`SELECT valor FROM meta WHERE clave = 'lote_actual'`).get();
  if (!row || !row.valor) return [];
  let ids = [];
  try {
    ids = JSON.parse(row.valor);
  } catch (_) {
    ids = [];
  }
  if (!Array.isArray(ids)) return [];
  return ids
    .map((id, index) => {
      const sorteo = getSorteoById(id);
      if (!sorteo) return null;
      return Object.assign({}, sorteo, { color: BATCH_COLORS[index % BATCH_COLORS.length] });
    })
    .filter(Boolean);
}

/**
 * Ejecuta un sorteo real en transacción.
 * Si falla, NO marca éxito (rollback + limpia candado).
 */
function executeDraw() {
  return executeDrawBatch(1);
}

/**
 * Hasta `count` sorteos en una sola transacción.
 * Cada uno sale de un área distinta. Si ya no hay áreas, premios o personas, el lote se corta.
 */
function executeDrawBatch(count = 3) {
  const db = getDb();
  const eventId = getActiveEventId();
  const event = getEvent(eventId);

  if (!event) throw Object.assign(new Error('Sin evento.'), { status: 400 });
  if (event.estado === 'finalizado') {
    throw Object.assign(new Error('Evento finalizado.'), { status: 409, goFinal: true });
  }
  if (event.estado !== 'en_curso') {
    throw Object.assign(new Error('El evento no está en curso.'), { status: 409 });
  }
  if (event.sorteo_en_curso || event.animacion_en_curso) {
    throw Object.assign(new Error('Sorteo o animación en curso.'), { status: 409, locked: true });
  }

  // Candado
  const locked = db
    .prepare(
      `UPDATE eventos SET sorteo_en_curso = 1, animacion_en_curso = 1
       WHERE id = ? AND sorteo_en_curso = 0 AND animacion_en_curso = 0`
    )
    .run(eventId);
  if (locked.changes === 0) {
    throw Object.assign(new Error('No se pudo adquirir candado de sorteo.'), { status: 409, locked: true });
  }

  try {
    const lote = runTransaction((db) => {
      const drawn = [];
      const usedAreas = [];
      const wanted = Math.max(1, Math.min(3, Number(count) || 1));
      for (let i = 0; i < wanted; i += 1) {
        const stock = db
          .prepare('SELECT COALESCE(SUM(cantidad_disponible), 0) AS c FROM premios')
          .get();
        if (!stock || stock.c <= 0) break;
        const fresh = getEvent(eventId);
        let pick = null;
        try {
          pick = pickPrizeAreaEmployeePreview(fresh, {
            excludeAreaIds: usedAreas,
            requireDistinctArea: true,
          });
        } catch (err) {
          if (drawn.length) break;
          throw err;
        }
        if (!pick) break;

        const updPremio = db
          .prepare(
            `UPDATE premios SET cantidad_disponible = cantidad_disponible - 1
             WHERE id = ? AND cantidad_disponible > 0`
          )
          .run(pick.premio.id);
        if (updPremio.changes === 0) throw new Error('Inventario de premio inconsistente.');

        const updEmp = db
          .prepare(
            `UPDATE empleados SET elegible = 0, atenuado = 1
             WHERE id = ? AND elegible = 1`
          )
          .run(pick.empleado.id);
        if (updEmp.changes === 0) throw new Error('Colaborador ya no elegible.');

        let sistemasGanadores = fresh.sistemas_ganadores || 0;
        if (pick.area.es_sistemas) sistemasGanadores += 1;

        const seqRow = db
          .prepare('SELECT COALESCE(MAX(secuencia), 0) AS m FROM sorteos WHERE evento_id = ?')
          .get(eventId);
        const secuencia = seqRow.m + 1;
        const sorteoId = uuidv4();
        const ahora = new Date().toISOString();

        db.prepare(
          `INSERT INTO sorteos (id, evento_id, secuencia, premio_id, area_id, empleado_id, creado_en)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(sorteoId, eventId, secuencia, pick.premio.id, pick.area.id, pick.empleado.id, ahora);

        db.prepare(
          `UPDATE eventos SET sistemas_ganadores = ?, sorteo_en_curso = 0, sorteo_actual_id = ?
           WHERE id = ?`
        ).run(sistemasGanadores, sorteoId, eventId);

        usedAreas.push(pick.area.id);
        drawn.push({
          sorteoId,
          secuencia,
          creadoEn: ahora,
          color: BATCH_COLORS[drawn.length % BATCH_COLORS.length],
          premio: {
            id: pick.premio.id,
            nombre: pick.premio.nombre,
            restante: pick.premio.cantidad_disponible - 1,
          },
          area: { id: pick.area.id, nombre: pick.area.nombre, esSistemas: !!pick.area.es_sistemas },
          empleado: { id: pick.empleado.id, nombre: pick.empleado.nombre },
        });
      }
      if (!drawn.length) throw new Error('No hay combinación válida.');
      saveLote(db, drawn.map((item) => item.sorteoId));
      return drawn;
    });

    return { ok: true, lote, ...lote[0] };
  } catch (err) {
    // Liberar candado sin marcar éxito
    try {
    db.prepare(
      `UPDATE eventos SET sorteo_en_curso = 0, animacion_en_curso = 0, sorteo_actual_id = NULL WHERE id = ?`
    ).run(eventId);
    clearLote(db);
    } catch (_) {
      /* ignore */
    }
    const e = Object.assign(err instanceof Error ? err : new Error(String(err)), {
      status: err.status || 500,
      drawFailed: true,
    });
    throw e;
  }
}

function releaseAnimationLock() {
  const db = getDb();
  const eventId = getActiveEventId();
  db.prepare(
    `UPDATE eventos SET animacion_en_curso = 0, sorteo_en_curso = 0 WHERE id = ?`
  ).run(eventId);
  clearLote(db);

  // Si no quedan premios → finalizado
  const units = db
    .prepare('SELECT COALESCE(SUM(cantidad_disponible),0) AS c FROM premios')
    .get().c;
  if (units <= 0) {
    db.prepare(
      `UPDATE eventos SET estado = 'finalizado', finalizado_en = ? WHERE id = ? AND estado = 'en_curso'`
    ).run(new Date().toISOString(), eventId);
    return { finalized: true };
  }
  return { finalized: false };
}

function getSorteoById(sorteoId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT s.*, p.nombre AS premio_nombre, a.nombre AS area_nombre, e.nombre AS empleado_nombre
       FROM sorteos s
       JOIN premios p ON p.id = s.premio_id
       JOIN areas a ON a.id = s.area_id
       JOIN empleados e ON e.id = s.empleado_id
       WHERE s.id = ?`
    )
    .get(sorteoId);
  if (!row) return null;
  return {
    sorteoId: row.id,
    secuencia: row.secuencia,
    creadoEn: row.creado_en,
    premio: { id: row.premio_id, nombre: row.premio_nombre },
    area: { id: row.area_id, nombre: row.area_nombre },
    empleado: { id: row.empleado_id, nombre: row.empleado_nombre },
  };
}

module.exports = {
  executeDraw,
  executeDrawBatch,
  releaseAnimationLock,
  pickPrizeAreaEmployeePreview,
  getSorteoById,
  readCurrentLote,
  BATCH_COLORS,
  weightedPick,
  uniformPick,
};

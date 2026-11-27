'use strict';

const express = require('express');
const { getDb, getActiveEventId, getEvent } = require('../db');
const { assessViability, applyCuotaOnStart, canDrawNow } = require('../services/sistemasQuota');
const { getSorteoById, readCurrentLote } = require('../services/drawEngine');
const { computeProbabilities } = require('../services/probabilities');

const router = express.Router();

router.get('/snapshot', (_req, res) => {
  const db = getDb();
  const event = getEvent();
  const empleados = db
    .prepare(
      `SELECT e.id, e.nombre, e.elegible, e.atenuado, a.nombre AS area, a.es_sistemas
       FROM empleados e JOIN areas a ON a.id = e.area_id
       ORDER BY e.nombre`
    )
    .all();
  const premios = db
    .prepare(
      `SELECT id, nombre, cantidad_inicial, cantidad_disponible FROM premios ORDER BY nombre`
    )
    .all();
  const areas = db.prepare('SELECT id, nombre, es_sistemas FROM areas ORDER BY nombre').all();
  const sorteos = db
    .prepare(
      `SELECT s.id, s.secuencia, s.creado_en, p.nombre AS premio, a.nombre AS area, e.nombre AS empleado
       FROM sorteos s
       JOIN premios p ON p.id = s.premio_id
       JOIN areas a ON a.id = s.area_id
       JOIN empleados e ON e.id = s.empleado_id
       WHERE s.evento_id = ?
       ORDER BY s.secuencia DESC`
    )
    .all(getActiveEventId());

  const unidadesDisp = premios.reduce((s, p) => s + p.cantidad_disponible, 0);
  const unidadesIni = premios.reduce((s, p) => s + p.cantidad_inicial, 0);
  const entregados = unidadesIni - unidadesDisp;

  let sorteoActual = null;
  if (event?.sorteo_actual_id) {
    sorteoActual = getSorteoById(event.sorteo_actual_id);
  }

  res.json({
    event: serializeEvent(event),
    empleados,
    premios,
    areas,
    sorteos,
    stats: {
      participantes: empleados.length,
      elegibles: empleados.filter((e) => e.elegible).length,
      areas: areas.length,
      unidadesDisponibles: unidadesDisp,
      unidadesIniciales: unidadesIni,
      entregados,
    },
    sorteoActual,
    lote: readCurrentLote(),
    canDraw: event?.estado === 'en_curso' ? canDrawNow() : { ok: false },
  });
});

router.post('/start', (req, res) => {
  const event = getEvent();
  if (!event) return res.status(400).json({ ok: false, message: 'Sin evento.' });
  if (event.estado === 'en_curso') {
    return res.json({ ok: true, alreadyStarted: true, event: serializeEvent(event) });
  }
  if (event.estado === 'finalizado') {
    return res.status(409).json({ ok: false, message: 'El evento ya finalizó. Reinicia para otro.' });
  }

  const viability = assessViability({ chooseCuota: false });
  if (!viability.ok) {
    return res.status(400).json({
      ok: false,
      message: 'Evento no viable.',
      errors: viability.errors,
      viability,
    });
  }

  const result = applyCuotaOnStart(event.id);
  if (!result.ok) {
    return res.status(400).json({ ok: false, errors: result.errors, viability: result.assessment });
  }

  const probs = computeProbabilities(result.cuota);
  res.json({
    ok: true,
    cuota: result.cuota,
    reglas: result.reglas,
    probabilities: probs,
    event: serializeEvent(getEvent()),
  });
});

router.post('/finalize', (_req, res) => {
  const db = getDb();
  const eventId = getActiveEventId();
  db.prepare(
    `UPDATE eventos SET estado='finalizado', finalizado_en=?, animacion_en_curso=0, sorteo_en_curso=0 WHERE id=?`
  ).run(new Date().toISOString(), eventId);
  res.json({ ok: true, event: serializeEvent(getEvent()) });
});

function serializeEvent(event) {
  if (!event) return null;
  let reglas = {};
  try {
    reglas = JSON.parse(event.reglas_json || '{}');
  } catch {
    /* */
  }
  return {
    id: event.id,
    nombre: event.nombre,
    estado: event.estado,
    sistemasCuota: event.sistemas_cuota_objetivo,
    sistemasGanadores: event.sistemas_ganadores,
    sorteoEnCurso: !!event.sorteo_en_curso,
    animacionEnCurso: !!event.animacion_en_curso,
    sorteoActualId: event.sorteo_actual_id,
    reglas,
    iniciadoEn: event.iniciado_en,
    finalizadoEn: event.finalizado_en,
  };
}

module.exports = router;

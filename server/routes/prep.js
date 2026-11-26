'use strict';

const express = require('express');
const multer = require('multer');
const { importEmpleados, importPremios, getImportCounts } = require('../services/importExcel');
const { assessViability } = require('../services/sistemasQuota');
const { computeProbabilities } = require('../services/probabilities');
const { getDb, getActiveEventId, getEvent, runTransaction } = require('../db');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

router.get('/status', (_req, res) => {
  const event = getEvent();
  const counts = getImportCounts();
  const viability = counts.participantes && counts.premios ? assessViability() : null;
  const probs = counts.participantes && counts.premios ? computeProbabilities() : null;
  res.json({
    event: event
      ? {
          id: event.id,
          nombre: event.nombre,
          estado: event.estado,
          sistemasCuota: event.sistemas_cuota_objetivo,
          sistemasGanadores: event.sistemas_ganadores,
          sorteoEnCurso: !!event.sorteo_en_curso,
          animacionEnCurso: !!event.animacion_en_curso,
          sorteoActualId: event.sorteo_actual_id,
          reglas: safeJson(event.reglas_json),
          iniciadoEn: event.iniciado_en,
          finalizadoEn: event.finalizado_en,
        }
      : null,
    imports: {
      participantesOk: counts.participantes > 0,
      premiosOk: counts.premios > 0,
      ...counts,
    },
    viability,
    probabilities: probs,
  });
});

router.post('/import/empleados', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'Falta archivo.', errors: [{ message: 'Falta archivo.' }] });
    }
    const result = await importEmpleados(req.file.buffer, { replace: isReplace(req) });
    sendImportResult(res, result);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message, errors: [{ message: e.message }] });
  }
});

router.post('/import/premios', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'Falta archivo.', errors: [{ message: 'Falta archivo.' }] });
    }
    const result = await importPremios(req.file.buffer, { replace: isReplace(req) });
    sendImportResult(res, result);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message, errors: [{ message: e.message }] });
  }
});

router.get('/viability', (_req, res) => {
  res.json(assessViability());
});

router.get('/probabilities', (_req, res) => {
  res.json(computeProbabilities());
});

router.post('/reset', (req, res) => {
  const { confirm } = req.body || {};
  if (confirm !== 'RESET') {
    return res.status(400).json({ ok: false, message: 'Se requiere confirmación doble (confirm: RESET).' });
  }
  const event = getEvent();
  if (event?.animacion_en_curso) {
    return res.status(409).json({ ok: false, message: 'No se puede reiniciar durante una animación.' });
  }
  runTransaction((db) => {
    db.prepare('DELETE FROM sorteos').run();
    db.prepare('DELETE FROM empleados').run();
    db.prepare('DELETE FROM premios').run();
    db.prepare('DELETE FROM areas').run();
    db.prepare(
      `UPDATE eventos SET estado='borrador', reglas_json='{}', sistemas_cuota_objetivo=NULL,
       sistemas_ganadores=0, sorteo_en_curso=0, animacion_en_curso=0, sorteo_actual_id=NULL,
       iniciado_en=NULL, finalizado_en=NULL WHERE id=?`
    ).run(getActiveEventId());
  });
  res.json({ ok: true });
});

function isReplace(req) {
  const flag = req.body && req.body.replace;
  return flag === '1' || flag === 'true' || flag === true;
}

function sendImportResult(res, result) {
  const status = result.ok ? 200 : 400;
  if (!result.ok && !result.message && Array.isArray(result.errors)) {
    result.message = result.errors
      .map((e) => e && e.message)
      .filter(Boolean)
      .join(' · ');
  }
  res.status(status).json(result);
}

function safeJson(s) {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
}

module.exports = router;

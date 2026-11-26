'use strict';

const express = require('express');
const { executeDraw, releaseAnimationLock, getSorteoById } = require('../services/drawEngine');
const { canDrawNow } = require('../services/sistemasQuota');
const { getEvent } = require('../db');

const router = express.Router();

router.post('/', (_req, res) => {
  try {
    const check = canDrawNow();
    if (!check.ok) {
      return res.status(check.locked ? 409 : 409).json({
        ok: false,
        message: check.reason,
        goFinal: !!check.goFinal,
        locked: !!check.locked,
      });
    }
    const result = executeDraw();
    res.json(result);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({
      ok: false,
      message: e.message,
      drawFailed: !!e.drawFailed,
      goFinal: !!e.goFinal,
      locked: !!e.locked,
    });
  }
});

router.post('/continue', (_req, res) => {
  try {
    const event = getEvent();
    if (!event) return res.status(400).json({ ok: false, message: 'Sin evento.' });
    const out = releaseAnimationLock();
    res.json({ ok: true, ...out, event: getEvent() });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.get('/current', (_req, res) => {
  const event = getEvent();
  if (!event?.sorteo_actual_id) return res.json({ ok: true, sorteo: null });
  const sorteo = getSorteoById(event.sorteo_actual_id);
  res.json({ ok: true, sorteo, animacionEnCurso: !!event.animacion_en_curso });
});

router.get('/:id', (req, res) => {
  const sorteo = getSorteoById(req.params.id);
  if (!sorteo) return res.status(404).json({ ok: false, message: 'Sorteo no encontrado.' });
  res.json({ ok: true, sorteo });
});

module.exports = router;

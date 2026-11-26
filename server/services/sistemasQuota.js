'use strict';

const crypto = require('crypto');
const { getDb, getActiveEventId, getEvent } = require('../db');

function cryptoInt(maxExclusive) {
  if (maxExclusive <= 0) throw new Error('cryptoInt: maxExclusive must be > 0');
  return crypto.randomInt(0, maxExclusive);
}

function getEligibleByArea() {
  const db = getDb();
  return db
    .prepare(
      `SELECT a.id, a.nombre, a.es_sistemas, COUNT(e.id) AS elegibles
       FROM areas a
       LEFT JOIN empleados e ON e.area_id = a.id AND e.elegible = 1
       GROUP BY a.id
       ORDER BY a.nombre`
    )
    .all();
}

function getPrizeUnits() {
  const db = getDb();
  const row = db
    .prepare('SELECT COALESCE(SUM(cantidad_disponible),0) AS c FROM premios WHERE cantidad_disponible > 0')
    .get();
  return row.c;
}

function getTotalInitialUnits() {
  const db = getDb();
  return db.prepare('SELECT COALESCE(SUM(cantidad_inicial),0) AS c FROM premios').get().c;
}

/**
 * Viabilidad pre-inicio + determinación de cuota Sistemas.
 * Returns { ok, errors, warnings, cuota, elegibles, unidades, probsSummary }
 */
function assessViability({ chooseCuota = false } = {}) {
  const db = getDb();
  const areas = getEligibleByArea();
  const elegibles = areas.reduce((s, a) => s + a.elegibles, 0);
  const unidades = getTotalInitialUnits();
  const disponibles = getPrizeUnits();
  const sistemas = areas.find((a) => a.es_sistemas === 1);
  const sistemasElegibles = sistemas ? sistemas.elegibles : 0;
  const errors = [];
  const warnings = [];

  if (elegibles === 0) errors.push('No hay participantes elegibles.');
  if (unidades === 0) errors.push('No hay unidades de premios.');
  if (elegibles < unidades) {
    errors.push(
      `Elegibles insuficientes: ${elegibles} personas para ${unidades} unidades de premios.`
    );
  }

  let cuota = null;
  if (!sistemas) {
    warnings.push('No se detectó área Sistemas; la cuota Sistemas no aplica.');
    cuota = 0;
  } else if (sistemasElegibles < 4) {
    errors.push(
      `Área Sistemas tiene solo ${sistemasElegibles} elegibles; se requieren al menos 4 para la cuota 4–5.`
    );
  } else if (unidades < 4) {
    errors.push('Inventario insuficiente para cumplir cuota mínima de Sistemas (4).');
  } else {
    const maxPossible = Math.min(5, sistemasElegibles, unidades);
    if (maxPossible < 4) {
      errors.push('No es posible cumplir cuota Sistemas 4–5 con el inventario/elegibles actuales.');
    } else if (sistemasElegibles >= 5 && unidades >= 5) {
      if (chooseCuota) {
        cuota = cryptoInt(2) === 0 ? 4 : 5; // crypto elige 4 o 5
      } else {
        cuota = null; // se elegirá al iniciar
      }
    } else {
      // solo 4 elegibles o inventario solo alcanza 4
      cuota = 4;
    }
  }

  // Áreas sin elegibles: warning only at start (they won't be in pool)
  for (const a of areas) {
    if (a.elegibles === 0) warnings.push(`Área sin elegibles: ${a.nombre}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    cuota,
    cuotaRango:
      sistemas && sistemasElegibles >= 5 && unidades >= 5
        ? '4 o 5 (se elige al iniciar con crypto)'
        : cuota === 4
          ? '4 (fija)'
          : cuota === 0
            ? 'no aplica'
            : 'no viable',
    elegibles,
    unidades,
    disponibles,
    sistemasElegibles,
    areas: areas.map((a) => ({
      id: a.id,
      nombre: a.nombre,
      esSistemas: !!a.es_sistemas,
      elegibles: a.elegibles,
    })),
  };
}

function applyCuotaOnStart(eventId) {
  const assessment = assessViability({ chooseCuota: true });
  if (!assessment.ok) {
    return { ok: false, errors: assessment.errors, assessment };
  }
  const cuota = assessment.cuota ?? 0;
  const db = getDb();
  const reglas = {
    cuotaSistemas: cuota,
    elegiblesAlInicio: assessment.elegibles,
    unidadesAlInicio: assessment.unidades,
    sistemasElegibles: assessment.sistemasElegibles,
    warnings: assessment.warnings,
    modelo:
      'premio ponderado por unidades; área ponderada por elegibles (Sistemas excluida al alcanzar cuota); colaborador uniforme',
  };
  db.prepare(
    `UPDATE eventos SET estado = 'en_curso', sistemas_cuota_objetivo = ?, sistemas_ganadores = 0,
     iniciado_en = ?, reglas_json = ? WHERE id = ?`
  ).run(cuota, new Date().toISOString(), JSON.stringify(reglas), eventId);

  return { ok: true, cuota, assessment, reglas };
}

function canDrawNow() {
  const event = getEvent();
  if (!event) return { ok: false, reason: 'Sin evento.' };
  if (event.estado === 'finalizado') return { ok: false, reason: 'Evento finalizado.', goFinal: true };
  if (event.estado !== 'en_curso') return { ok: false, reason: 'El evento no está en curso.' };
  if (event.sorteo_en_curso || event.animacion_en_curso) {
    return { ok: false, reason: 'Hay un sorteo o animación en curso.', locked: true };
  }
  const units = getPrizeUnits();
  if (units <= 0) return { ok: false, reason: 'No quedan premios.', goFinal: true };

  const elegibles = getDb().prepare('SELECT COUNT(*) AS c FROM empleados WHERE elegible = 1').get().c;
  if (elegibles <= 0) return { ok: false, reason: 'No quedan elegibles.', goFinal: true };

  // Check if any valid combination exists (especially Sistemas quota edge)
  const { pickPrizeAreaEmployeePreview } = require('./drawEngine');
  try {
    pickPrizeAreaEmployeePreview(event);
  } catch (e) {
    return { ok: false, reason: e.message || 'Sin combinación válida.', goFinal: true };
  }

  return { ok: true };
}

module.exports = {
  assessViability,
  applyCuotaOnStart,
  canDrawNow,
  getEligibleByArea,
  getPrizeUnits,
  getTotalInitialUnits,
  cryptoInt,
};

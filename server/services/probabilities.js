'use strict';

const { getDb } = require('../db');
const { assessViability } = require('./sistemasQuota');

/**
 * Documenta probabilidades reales del modelo (prep).
 * No finge igualdad entre áreas.
 */
function computeProbabilities(cuotaHint) {
  const db = getDb();
  const viability = assessViability({ chooseCuota: false });
  const premios = db.prepare('SELECT id, nombre, cantidad_disponible AS unidades FROM premios WHERE cantidad_disponible > 0').all();
  const totalUnits = premios.reduce((s, p) => s + p.unidades, 0);

  const premioProbs = premios.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    unidades: p.unidades,
    probabilidad: totalUnits ? p.unidades / totalUnits : 0,
  }));

  const areas = viability.areas.filter((a) => a.elegibles > 0);
  // Approximate: if Sistemas has cuota, after many draws weight shifts; at start show current weights
  // excluding Sistemas only if cuota already reached (prep: cuota not applied yet)
  let pool = areas;
  const cuota = cuotaHint ?? viability.cuota;
  // At prep, Sistemas is included; note that cuota will cap later
  const totalEleg = pool.reduce((s, a) => s + a.elegibles, 0);
  const areaProbs = pool.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    elegibles: a.elegibles,
    esSistemas: a.esSistemas,
    probabilidad: totalEleg ? a.elegibles / totalEleg : 0,
    nota: a.esSistemas
      ? `Sujeta a cuota Sistemas (${viability.cuotaRango}). No se favorece por ser chica.`
      : 'Ponderada por nº de elegibles (áreas grandes tienen más peso).',
  }));

  return {
    modelo:
      '1) Premio ponderado por unidades disponibles. 2) Área ponderada por elegibles actuales (Sistemas excluida al alcanzar cuota). 3) Colaborador uniforme dentro del área.',
    aviso: 'Las áreas NO tienen la misma probabilidad. Sistemas tiene cuota 4–5, no ventaja por tamaño pequeño.',
    cuotaSistemas: viability.cuotaRango,
    elegibles: viability.elegibles,
    unidades: viability.unidades,
    premios: premioProbs,
    areas: areaProbs,
    viability,
  };
}

module.exports = { computeProbabilities };

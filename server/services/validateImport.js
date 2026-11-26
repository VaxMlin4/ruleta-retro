'use strict';

function normalizeAreaName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSistemasArea(name) {
  const n = normalizeAreaName(name);
  return n === 'sistemas' || n === 'ti' || n === 'tecnologias de la informacion' || n === 'sistemas ti';
}

function validateEmpleados(rows) {
  const errors = [];
  const ids = new Set();

  if (!rows.length) {
    errors.push({ row: 0, message: 'El archivo de participantes está vacío.' });
    return { ok: false, errors };
  }

  for (const r of rows) {
    if (!r.id) errors.push({ row: r.rowNumber, message: 'ID vacío.' });
    if (!r.nombre) errors.push({ row: r.rowNumber, message: 'Nombre vacío.' });
    if (!r.area) errors.push({ row: r.rowNumber, message: 'Área vacía.' });
    if (r.id) {
      if (ids.has(r.id)) errors.push({ row: r.rowNumber, message: `ID duplicado: ${r.id}` });
      ids.add(r.id);
    }
  }

  return { ok: errors.length === 0, errors };
}

function validatePremios(rows) {
  const errors = [];
  const ids = new Set();

  if (!rows.length) {
    errors.push({ row: 0, message: 'El archivo de premios está vacío.' });
    return { ok: false, errors };
  }

  for (const r of rows) {
    if (!r.id) errors.push({ row: r.rowNumber, message: 'ID vacío.' });
    if (!r.nombre) errors.push({ row: r.rowNumber, message: 'Nombre/artículo vacío.' });
    if (!Number.isFinite(r.cantidad) || r.cantidad < 1 || !Number.isInteger(r.cantidad)) {
      errors.push({
        row: r.rowNumber,
        message: `Cantidad inválida (debe ser entero ≥ 1): ${r.cantidad}`,
      });
    }
    if (r.id) {
      if (ids.has(r.id)) errors.push({ row: r.rowNumber, message: `ID duplicado: ${r.id}` });
      ids.add(r.id);
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  normalizeAreaName,
  isSistemasArea,
  validateEmpleados,
  validatePremios,
};

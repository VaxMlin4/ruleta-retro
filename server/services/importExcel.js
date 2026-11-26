'use strict';

const ExcelJS = require('exceljs');
const { v4: uuidv4 } = require('uuid');
const { getDb, getActiveEventId, runTransaction } = require('../db');
const { validateEmpleados, validatePremios, normalizeAreaName, isSistemasArea } = require('./validateImport');

async function readSheetRows(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      let v = cell.value;
      if (v && typeof v === 'object' && v.text) v = v.text;
      if (v && typeof v === 'object' && v.result !== undefined) v = v.result;
      values[colNumber - 1] = v == null ? '' : String(v).trim();
    });
    rows.push({ rowNumber, values });
  });
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].values.map((h) => String(h || '').trim());
  return { headers, rows: rows.slice(1) };
}

function headerIndex(headers, candidates) {
  const norm = headers.map((h) =>
    String(h || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
  );
  for (const c of candidates) {
    const i = norm.indexOf(c);
    if (i >= 0) return i;
  }
  return -1;
}

function rejectIfLocked(event, replace) {
  if (!event || !['en_curso', 'finalizado'].includes(event.estado)) return null;
  if (event.animacion_en_curso) {
    return {
      ok: false,
      message: 'No se pueden cambiar los archivos mientras hay una animación en curso.',
      errors: [{ row: 0, message: 'No se pueden cambiar los archivos mientras hay una animación en curso.' }],
    };
  }
  if (!replace) {
    return {
      ok: false,
      message:
        'No se pueden reemplazar los archivos con el evento en curso o finalizado. Confirma el reemplazo para reiniciar el sorteo.',
      errors: [
        {
          row: 0,
          message:
            'No se pueden reemplazar los archivos con el evento en curso o finalizado. Confirma el reemplazo para reiniciar el sorteo.',
        },
      ],
    };
  }
  return null;
}

async function importEmpleados(buffer, options = {}) {
  const replace = options.replace === true || options.replace === '1';
  const { headers, rows } = await readSheetRows(buffer);
  const iId = headerIndex(headers, ['id', 'id empleado', 'id colaborador', 'empleado_id', 'colaborador_id', 'codigo']);
  const iNombre = headerIndex(headers, ['nombre', 'name', 'empleado', 'colaborador', 'nombre completo']);
  const iArea = headerIndex(headers, ['area', 'área', 'departamento', 'depto']);

  if (iId < 0 || iNombre < 0 || iArea < 0) {
    return {
      ok: false,
      errors: [
        {
          row: 1,
          message:
            'Encabezados requeridos: ID, Nombre, Área (se aceptan aliases). Encontrados: ' +
            headers.join(', '),
        },
      ],
    };
  }

  const parsed = rows.map((r) => ({
    rowNumber: r.rowNumber,
    id: String(r.values[iId] || '').trim(),
    nombre: String(r.values[iNombre] || '').trim(),
    area: String(r.values[iArea] || '').trim(),
  }));

  const validation = validateEmpleados(parsed);
  if (!validation.ok) return validation;

  const db = getDb();
  const event = db.prepare('SELECT * FROM eventos WHERE id = ?').get(getActiveEventId());
  const locked = rejectIfLocked(event, replace);
  if (locked) return locked;

  runTransaction((db) => {
    db.prepare('DELETE FROM sorteos').run();
    db.prepare('DELETE FROM empleados').run();
    db.prepare('DELETE FROM areas').run();

    const areaMap = new Map();
    for (const e of parsed) {
      const key = normalizeAreaName(e.area);
      if (!areaMap.has(key)) {
        const areaId = uuidv4();
        const nombre = e.area.trim();
        const esSistemas = isSistemasArea(nombre) ? 1 : 0;
        db.prepare('INSERT INTO areas (id, nombre, es_sistemas) VALUES (?, ?, ?)').run(
          areaId,
          nombre,
          esSistemas
        );
        areaMap.set(key, areaId);
      }
      db.prepare(
        'INSERT INTO empleados (id, nombre, area_id, elegible, atenuado) VALUES (?, ?, ?, 1, 0)'
      ).run(e.id, e.nombre, areaMap.get(key));
    }

    updateEventStateAfterImport(db);
  });

  const counts = getImportCounts();
  return { ok: true, ...counts, errors: [] };
}

async function importPremios(buffer, options = {}) {
  const replace = options.replace === true || options.replace === '1';
  const { headers, rows } = await readSheetRows(buffer);
  const iId = headerIndex(headers, ['id', 'id articulo', 'id artículo', 'articulo_id', 'codigo']);
  const iNombre = headerIndex(headers, ['nombre', 'articulo', 'artículo', 'premio', 'name']);
  const iCant = headerIndex(headers, ['cantidad', 'qty', 'unidades', 'stock']);

  if (iId < 0 || iNombre < 0 || iCant < 0) {
    return {
      ok: false,
      errors: [
        {
          row: 1,
          message:
            'Encabezados requeridos: ID, Nombre/Artículo, Cantidad. Encontrados: ' +
            headers.join(', '),
        },
      ],
    };
  }

  const parsed = rows.map((r) => ({
    rowNumber: r.rowNumber,
    id: String(r.values[iId] || '').trim(),
    nombre: String(r.values[iNombre] || '').trim(),
    cantidad: Number(String(r.values[iCant] || '').replace(',', '.')),
  }));

  const validation = validatePremios(parsed);
  if (!validation.ok) return validation;

  const db = getDb();
  const event = db.prepare('SELECT * FROM eventos WHERE id = ?').get(getActiveEventId());
  const locked = rejectIfLocked(event, replace);
  if (locked) return locked;

  runTransaction((db) => {
    db.prepare('DELETE FROM sorteos').run();
    db.prepare('DELETE FROM premios').run();
    for (const p of parsed) {
      const cant = Math.floor(p.cantidad);
      db.prepare(
        'INSERT INTO premios (id, nombre, cantidad_inicial, cantidad_disponible) VALUES (?, ?, ?, ?)'
      ).run(p.id, p.nombre, cant, cant);
    }
    db.prepare('UPDATE empleados SET elegible = 1, atenuado = 0').run();
    updateEventStateAfterImport(db);
  });

  const counts = getImportCounts();
  return { ok: true, ...counts, errors: [] };
}

function updateEventStateAfterImport(db) {
  const emp = db.prepare('SELECT COUNT(*) AS c FROM empleados').get().c;
  const prem = db.prepare('SELECT COUNT(*) AS c FROM premios').get().c;
  const eventId = getActiveEventId();
  let estado = 'borrador';
  if (emp > 0 && prem > 0) estado = 'validado';
  else if (emp > 0 || prem > 0) estado = 'borrador';
  db.prepare(
    `UPDATE eventos SET estado = ?, sistemas_cuota_objetivo = NULL, sistemas_ganadores = 0,
     sorteo_en_curso = 0, animacion_en_curso = 0, sorteo_actual_id = NULL,
     iniciado_en = NULL, finalizado_en = NULL, reglas_json = '{}' WHERE id = ?`
  ).run(estado, eventId);
}

function getImportCounts() {
  const db = getDb();
  return {
    participantes: db.prepare('SELECT COUNT(*) AS c FROM empleados').get().c,
    areas: db.prepare('SELECT COUNT(*) AS c FROM areas').get().c,
    premios: db.prepare('SELECT COUNT(*) AS c FROM premios').get().c,
    unidadesPremios: db.prepare('SELECT COALESCE(SUM(cantidad_inicial),0) AS c FROM premios').get().c,
  };
}

module.exports = {
  importEmpleados,
  importPremios,
  getImportCounts,
  readSheetRows,
};

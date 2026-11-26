'use strict';

const ExcelJS = require('exceljs');
const { getDb, getActiveEventId } = require('../db');

async function buildWinnersWorkbook() {
  const db = getDb();
  const eventId = getActiveEventId();
  const rows = db
    .prepare(
      `SELECT s.secuencia, s.creado_en, e.id AS empleado_id, e.nombre AS empleado,
              a.nombre AS area, p.id AS premio_id, p.nombre AS premio
       FROM sorteos s
       JOIN empleados e ON e.id = s.empleado_id
       JOIN areas a ON a.id = s.area_id
       JOIN premios p ON p.id = s.premio_id
       WHERE s.evento_id = ?
       ORDER BY s.secuencia`
    )
    .all(eventId);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Disco y Destino 70\'s';
  const ws = wb.addWorksheet('Ganadores');
  ws.columns = [
    { header: 'Secuencia', key: 'secuencia', width: 12 },
    { header: 'Fecha', key: 'creado_en', width: 24 },
    { header: 'ID Colaborador', key: 'empleado_id', width: 16 },
    { header: 'Colaborador', key: 'empleado', width: 32 },
    { header: 'Área', key: 'area', width: 20 },
    { header: 'ID Premio', key: 'premio_id', width: 14 },
    { header: 'Premio', key: 'premio', width: 28 },
  ];
  for (const r of rows) ws.addRow(r);

  const inv = wb.addWorksheet('Inventario');
  inv.columns = [
    { header: 'ID', key: 'id', width: 14 },
    { header: 'Premio', key: 'nombre', width: 28 },
    { header: 'Inicial', key: 'cantidad_inicial', width: 10 },
    { header: 'Disponible', key: 'cantidad_disponible', width: 12 },
    { header: 'Entregados', key: 'entregados', width: 12 },
  ];
  const premios = db.prepare('SELECT * FROM premios ORDER BY nombre').all();
  for (const p of premios) {
    inv.addRow({
      id: p.id,
      nombre: p.nombre,
      cantidad_inicial: p.cantidad_inicial,
      cantidad_disponible: p.cantidad_disponible,
      entregados: p.cantidad_inicial - p.cantidad_disponible,
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

module.exports = { buildWinnersWorkbook };

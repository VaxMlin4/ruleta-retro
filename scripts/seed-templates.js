'use strict';

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const OUT = path.join(__dirname, '..', 'templates');
fs.mkdirSync(OUT, { recursive: true });

const AREAS = [
  'Sistemas de Información',
  'Recursos Humanos',
  'Finanzas',
  'Ventas',
  'Marketing',
  'Operaciones',
  'Legal',
  'Compras',
  'Logística',
  'Calidad',
  'Atención a Clientes',
  'Dirección',
];

async function buildParticipantes() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Participantes');
  ws.columns = [
    { header: 'ID', key: 'id', width: 12 },
    { header: 'Nombre', key: 'nombre', width: 32 },
    { header: 'Área', key: 'area', width: 22 },
  ];

  const first = [
    'Ana', 'Luis', 'María', 'Carlos', 'Sofía', 'Pedro', 'Elena', 'Jorge', 'Laura', 'Diego',
    'Carmen', 'Miguel', 'Patricia', 'Andrés', 'Lucía', 'Fernando', 'Valeria', 'Ricardo', 'Natalia', 'Héctor',
  ];
  const last = [
    'García', 'Hernández', 'López', 'Martínez', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Torres',
    'Flores', 'Rivera', 'Gómez', 'Díaz', 'Cruz', 'Morales', 'Reyes', 'Ortiz', 'Gutierrez', 'Ruiz',
  ];

  let n = 0;
  // Sistemas de Información: 8 personas (cuota 2–3 viable)
  for (let i = 0; i < 8; i++) {
    n++;
    ws.addRow({
      id: `E${String(n).padStart(3, '0')}`,
      nombre: `${first[i % first.length]} ${last[i % last.length]} Sis${n}`,
      area: 'Sistemas de Información',
    });
  }
  // Otras áreas: total ~60 colaboradores (nombres únicos)
  for (let i = 0; n < 60; i++) {
    n++;
    const area = AREAS[1 + (i % (AREAS.length - 1))];
    ws.addRow({
      id: `E${String(n).padStart(3, '0')}`,
      nombre: `${first[(i + 3) % first.length]} ${last[(i + 7) % last.length]} ${last[(i + 11) % last.length]} ${n}`,
      area,
    });
  }

  await wb.xlsx.writeFile(path.join(OUT, 'participantes.xlsx'));
  console.log('templates/participantes.xlsx —', n, 'filas');
}

async function buildPremios() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Premios');
  ws.columns = [
    { header: 'ID', key: 'id', width: 12 },
    { header: 'Artículo', key: 'nombre', width: 28 },
    { header: 'Cantidad', key: 'cantidad', width: 12 },
  ];
  const items = [
    { id: 'P01', nombre: 'Bocinas', cantidad: 3 },
    { id: 'P02', nombre: 'Cafeteras', cantidad: 2 },
    { id: 'P03', nombre: 'Audífonos', cantidad: 4 },
    { id: 'P04', nombre: 'Pantallas', cantidad: 2 },
    { id: 'P05', nombre: 'Licuadoras', cantidad: 3 },
    { id: 'P06', nombre: 'Otros premios', cantidad: 6 },
  ];
  // Total unidades = 20; elegibles 60 ≥ 20; Sistemas de Información cuota 2–3 OK
  for (const it of items) ws.addRow(it);
  await wb.xlsx.writeFile(path.join(OUT, 'premios.xlsx'));
  console.log('templates/premios.xlsx —', items.length, 'tipos,', items.reduce((s, i) => s + i.cantidad, 0), 'unidades');
}

(async () => {
  await buildParticipantes();
  await buildPremios();
})();

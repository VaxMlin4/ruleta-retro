'use strict';

/**
 * Prueba E2E vía HTTP contra el servidor local.
 * Arranca el server en puerto efímero, importa templates, inicia, sortea todo, exporta.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = 3099;
const HOST = '127.0.0.1';
const DB = path.join(ROOT, 'data', 'ruleta.sqlite');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  ✓', msg);
  } else {
    failed++;
    console.error('  ✗', msg);
  }
}

function req(method, urlPath, body, isForm) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: HOST,
      port: PORT,
      path: urlPath,
      method,
      headers: {},
    };
    let payload = null;
    if (isForm) {
      payload = body;
      opts.headers['Content-Type'] = body.contentType;
      opts.headers['Content-Length'] = body.buffer.length;
    } else if (body) {
      payload = Buffer.from(JSON.stringify(body));
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = payload.length;
    }
    const r = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const ct = res.headers['content-type'] || '';
        let data = buf;
        if (ct.includes('json')) {
          try {
            data = JSON.parse(buf.toString('utf8'));
          } catch {
            data = buf.toString('utf8');
          }
        }
        resolve({ status: res.statusCode, data, headers: res.headers, buf });
      });
    });
    r.on('error', reject);
    if (payload) {
      if (isForm) r.write(payload.buffer);
      else r.write(payload);
    }
    r.end();
  });
}

function multipart(filePath, fieldName) {
  const boundary = '----RuletaBoundary' + Date.now();
  const filename = path.basename(filePath);
  const file = fs.readFileSync(filePath);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    buffer: Buffer.concat([head, file, tail]),
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealth(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const h = await req('GET', '/api/health');
      if (h.status === 200) return true;
    } catch (_) {
      /* */
    }
    await sleep(200);
  }
  throw new Error('Server no respondió health');
}

async function main() {
  console.log('\n=== test-e2e ===\n');

  // Fresh DB
  if (fs.existsSync(DB)) fs.unlinkSync(DB);

  const child = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

  try {
    await waitHealth();
    assert(true, 'Servidor arriba');

    const empForm = multipart(path.join(ROOT, 'templates/participantes.xlsx'), 'file');
    const premForm = multipart(path.join(ROOT, 'templates/premios.xlsx'), 'file');

    let r = await req('POST', '/api/prep/import/empleados', empForm, true);
    assert(r.status === 200 && r.data.ok, `Import participantes (${r.data.participantes || r.data.message})`);

    r = await req('POST', '/api/prep/import/premios', premForm, true);
    assert(r.status === 200 && r.data.ok, `Import premios (${r.data.unidadesPremios} uds)`);

    r = await req('GET', '/api/prep/status');
    assert(r.data.viability?.ok, 'Viabilidad pre-inicio OK');
    assert(r.data.probabilities?.areas?.length > 0, 'Probabilidades documentadas');

    r = await req('POST', '/api/event/start', {});
    assert(r.status === 200 && r.data.ok, `Evento iniciado cuota=${r.data.cuota}`);

    // Double draw should 409 while locked — first draw
    r = await req('POST', '/api/draw', {});
    assert(r.status === 200 && r.data.ok && r.data.lote && r.data.lote.length >= 1 && r.data.lote.length <= 3, `Primer lote: ${(r.data.lote || []).length} sorteos`);
    const areasLote = new Set((r.data.lote || []).map((item) => item.area && item.area.id));
    assert(areasLote.size === (r.data.lote || []).length, 'Áreas distintas dentro del lote');
    const firstId = r.data.sorteoId;

    const r2 = await req('POST', '/api/draw', {});
    assert(r2.status === 409, 'Candado anti-doble-sorteo (409)');

    // Replay same
    const cur = await req('GET', '/api/draw/current');
    assert(cur.data.sorteo?.sorteoId === firstId, 'Replay/current = mismo sorteo');

    await req('POST', '/api/draw/continue', {});

    // Drain remaining
    let draws = (r.data.lote || []).length;
    for (;;) {
      const snap = await req('GET', '/api/event/snapshot');
      if (snap.data.stats.unidadesDisponibles <= 0) break;
      const d = await req('POST', '/api/draw', {});
      if (!d.data.ok) {
        if (d.data.goFinal) break;
        assert(false, `Draw falló: ${d.data.message}`);
        break;
      }
      draws += (d.data.lote || []).length || 1;
      await req('POST', '/api/draw/continue', {});
    }
    assert(draws >= 1, `Sorteos completados: ${draws}`);

    const snap = await req('GET', '/api/event/snapshot');
    assert(
      snap.data.stats.unidadesDisponibles === 0 || snap.data.event.estado === 'finalizado',
      'Premios agotados / finalizado'
    );

    // Unique winners (por secuencia; nombres de muestra pueden repetirse)
    assert(snap.data.sorteos.length === draws, `Filas de sorteo = draws (${snap.data.sorteos.length} vs ${draws})`);
    const seqs = snap.data.sorteos.map((s) => s.secuencia);
    assert(new Set(seqs).size === seqs.length, 'Secuencias únicas');

    const exp = await req('GET', '/api/export/ganadores');
    assert(exp.status === 200 && exp.buf.length > 1000, `Export Excel (${exp.buf.length} bytes)`);

    console.log(`\nResultado E2E: ${passed} passed, ${failed} failed\n`);
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

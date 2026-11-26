/* global fetch */
window.API = (() => {
  async function req(url, opts = {}) {
    const res = await fetch(url, opts);
    const ct = res.headers.get('content-type') || '';
    let data = null;
    if (ct.includes('application/json')) data = await res.json();
    else if (ct.includes('sheet') || ct.includes('octet')) data = await res.blob();
    else data = await res.text();
    if (!res.ok) {
      const err = new Error(errorMessage(data, res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function errorMessage(data, status) {
    if (data && typeof data === 'object') {
      if (data.message) return data.message;
      if (Array.isArray(data.errors) && data.errors.length) {
        return data.errors
          .map((e) => (e && e.row ? `Fila ${e.row}: ${e.message}` : e && e.message))
          .filter(Boolean)
          .join(' · ');
      }
    }
    if (typeof data === 'string' && data.trim() && data.trim().charAt(0) !== '<') {
      return data.trim().slice(0, 240);
    }
    return `HTTP ${status}`;
  }

  function importForm(file, replace) {
    const fd = new FormData();
    fd.append('file', file);
    if (replace) fd.append('replace', '1');
    return fd;
  }

  return {
    health: () => req('/api/health'),
    prepStatus: () => req('/api/prep/status'),
    importEmpleados: (file, opts = {}) =>
      req('/api/prep/import/empleados', { method: 'POST', body: importForm(file, opts.replace) }),
    importPremios: (file, opts = {}) =>
      req('/api/prep/import/premios', { method: 'POST', body: importForm(file, opts.replace) }),
    viability: () => req('/api/prep/viability'),
    probabilities: () => req('/api/prep/probabilities'),
    reset: () =>
      req('/api/prep/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'RESET' }),
      }),
    snapshot: () => req('/api/event/snapshot'),
    startEvent: () => req('/api/event/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    finalize: () => req('/api/event/finalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    draw: () => req('/api/draw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    continueDraw: () => req('/api/draw/continue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    currentDraw: () => req('/api/draw/current'),
    getDraw: (id) => req(`/api/draw/${id}`),
    exportUrl: '/api/export/ganadores',
  };
})();

/* global SlotAnim, AppFlow */
window.UI5 = {
  create(root, app) {
    const el = document.createElement('section');
    el.className = 'screen';
    el.id = 'screen-ui5';
    el.innerHTML = `
      <div class="disco-stage"></div>
      <div class="spotlight left"></div>
      <div class="spotlight right"></div>
      <div class="disco-ball"></div>
      <div class="disco-floor"></div>
      <div class="screen-content">
        <p class="eyebrow">El gran sorteo</p>
        <h1 class="brand-title" style="font-size:clamp(1.6rem,3.5vw,2.4rem)">¿QUIÉN GANA?</h1>
        <div class="slot-row" id="ui5-row"></div>
        <p class="slot-status" id="ui5-status">Seleccionando colaboradores...</p>
      </div>
      <footer class="app-footer">
        <div class="footer-actions">
          <button type="button" class="btn-icon" data-fs title="Pantalla completa">⛶</button>
        </div>
      </footer>
      <div class="blocking-overlay"></div>
    `;
    root.appendChild(el);
    el.querySelector('[data-fs]').onclick = () => app.toggleFullscreen();

    let job = 0;
    let active = null;

    function onHide() {
      job += 1;
      if (active) active.cancel();
      active = null;
    }

    async function onShow(opts = {}) {
      const token = ++job;
      if (active) active.cancel();
      active = null;
      const status = el.querySelector('#ui5-status');
      const row = el.querySelector('#ui5-row');
      row.innerHTML = '';

      const lote = activeLote(opts, app);
      const sorteo = lote[0] || opts.sorteo || app.state.currentSorteo;
      if (!sorteo || !sorteo.empleado) {
        app.beginRaffle();
        return;
      }
      status.textContent = 'Seleccionando colaboradores...';
      const snap = app.state.snapshot || (await app.refreshSnapshot());
      if (token !== job || app.state.abortAnim) return;
      row.dataset.count = String(lote.length);
      const runs = lote.map((item) => {
        const machine = document.createElement('div');
        machine.className = 'glow-card slot-machine';
        machine.style.setProperty('--draw-color', item.color);
        machine.style.setProperty('--draw-lamp', lampColor(item.color));
        machine.innerHTML = `<p class="slot-kicker">Máquina de nombres</p><div class="slot-window"></div><p class="slot-award">${escapeHtml(item.premio && item.premio.nombre)}</p>`;
        row.appendChild(machine);
        const areaName = item.area && item.area.nombre;
        const employees = (snap.empleados || []).filter((person) => person.area === areaName);
        const built = SlotAnim.buildReel(
          employees,
          item.empleado,
          item.sorteoId || item.secuencia || item.empleado.id
        );
        return SlotAnim.run(machine.querySelector('.slot-window'), built, {
          shouldAbort: () => token !== job || !!app.state.abortAnim,
        });
      });
      active = {
        cancel() {
          runs.forEach((run) => run.cancel());
        },
      };
      const results = await Promise.all(runs.map((run) => run.done));
      if (results.some((result) => !result || result.aborted) || token !== job || app.state.abortAnim) return;
      await wait(900);
      if (token !== job || app.state.abortAnim) return;
      AppFlow.afterEmployee();
    }

    return { el, onShow, onHide };
  },
};

function lampColor(color) {
  const hex = String(color || '').trim().toUpperCase();
  if (hex === '#912C70') return '#F3C0E2';
  if (hex === '#F47D20') return '#FFC48A';
  if (hex === '#FFC354') return '#FFE3A6';
  return '#FFE5B8';
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

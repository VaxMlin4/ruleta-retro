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
        <div class="glow-card slot-machine">
          <p style="color:var(--gold);letter-spacing:.15em;font-size:.8rem">MÁQUINA DE NOMBRES</p>
          <div class="slot-window" id="ui5-window"></div>
          <p class="slot-status" id="ui5-status">Seleccionando colaborador...</p>
        </div>
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
      const status = el.querySelector('#ui5-status');
      status.textContent = 'Seleccionando colaborador...';

      const sorteo = opts.sorteo || app.state.currentSorteo;
      if (!sorteo || !sorteo.empleado) {
        app.beginRaffle();
        return;
      }
      const snap = app.state.snapshot || (await app.refreshSnapshot());
      if (token !== job || app.state.abortAnim) return;
      const areaName = sorteo.area && sorteo.area.nombre;
      const employees = (snap.empleados || []).filter((person) => person.area === areaName);
      const built = SlotAnim.buildReel(
        employees,
        sorteo.empleado,
        sorteo.sorteoId || sorteo.secuencia || sorteo.empleado.id
      );
      active = SlotAnim.run(el.querySelector('#ui5-window'), built, {
        shouldAbort: () => token !== job || !!app.state.abortAnim,
        onLock(words) {
          if (token !== job) return;
          status.textContent = words.join(' ');
        },
      });
      const result = await active.done;
      if (!result || result.aborted || token !== job || app.state.abortAnim) return;
      status.textContent = `Ganador: ${sorteo.empleado.nombre}`;
      await wait(900);
      if (token !== job || app.state.abortAnim) return;
      AppFlow.afterEmployee();
    }

    return { el, onShow, onHide };
  },
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* global PlinkoAnim, AppFlow, gsap */
window.UI4 = {
  create(root, app) {
    const el = document.createElement('section');
    el.className = 'screen';
    el.id = 'screen-ui4';
    el.innerHTML = `
      <div class="disco-stage"></div>
      <div class="spotlight left"></div>
      <div class="spotlight right"></div>
      <div class="disco-ball"></div>
      <div class="plinko-screen">
        <header class="plinko-head">
          <div class="plinko-prize" id="ui4-prize"></div>
          <h1 class="plinko-question">¿QUÉ ÁREA SERÁ LA AFORTUNADA?</h1>
        </header>
        <div class="plinko-viewport" id="ui4-board"></div>
        <div class="plinko-result" id="ui4-result" hidden>
          <span>Área seleccionada</span>
          <strong id="ui4-result-name"></strong>
        </div>
      </div>
      <footer class="app-footer">
        <div class="footer-actions">
          <button type="button" class="btn-icon" data-fs title="Pantalla completa">⛶</button>
        </div>
      </footer>
    `;
    root.appendChild(el);
    el.querySelector('[data-fs]').onclick = () => app.toggleFullscreen();

    let seq = 0;

    async function onShow(opts = {}) {
      const token = ++seq;
      const sorteo = opts.sorteo || app.state.currentSorteo;
      const board = el.querySelector('#ui4-board');
      const question = el.querySelector('.plinko-question');
      const result = el.querySelector('#ui4-result');
      const resultName = el.querySelector('#ui4-result-name');
      question.textContent = '¿QUÉ ÁREA SERÁ LA AFORTUNADA?';
      result.hidden = true;
      result.classList.remove('is-on');
      if (board._plinkoStop) board._plinkoStop();

      if (!sorteo || !sorteo.area) {
        app.beginRaffle();
        return;
      }

      el.querySelector('#ui4-prize').innerHTML =
        `<span>Premio</span><strong>${escapeHtml(sorteo.premio && sorteo.premio.nombre)}</strong>`;

      const snap = app.state.snapshot || (await app.refreshSnapshot());
      if (token !== seq || app.state.abortAnim) return;

      const eleg = {};
      for (const empleado of snap.empleados || []) {
        if (empleado.elegible) eleg[empleado.area] = (eleg[empleado.area] || 0) + 1;
      }
      let areas = (snap.areas || []).map((a) => ({
        id: a.id,
        nombre: a.nombre,
        dimmed: (eleg[a.nombre] || 0) <= 0 && a.id !== sorteo.area.id,
      }));
      if (!areas.find((a) => a.id === sorteo.area.id)) {
        areas.push({ id: sorteo.area.id, nombre: sorteo.area.nombre, dimmed: false });
      }
      if (!areas.length) {
        areas = [{ id: sorteo.area.id, nombre: sorteo.area.nombre, dimmed: false }];
      }

      await new Promise((r) => requestAnimationFrame(r));
      if (token !== seq || app.state.abortAnim) return;

      const ids = areas
        .map((a) => a.id)
        .slice()
        .sort()
        .join('|');
      let layout = app.state.plinkoLayout;
      const width = board.clientWidth > 200 ? board.clientWidth : 880;
      if (!layout || layout._key !== ids) {
        layout = PlinkoAnim.layoutBoard(areas, width);
        layout._key = ids;
        app.state.plinkoLayout = layout;
      }

      const run = await PlinkoAnim.play(board, {
        areas,
        winnerId: sorteo.area.id,
        seed: sorteo.sorteoId || sorteo.secuencia || sorteo.area.id,
        layout,
        shouldAbort: () => token !== seq || !!app.state.abortAnim,
        onArrive(pocket) {
          if (token !== seq) return;
          resultName.textContent = (pocket && pocket.nombre) || sorteo.area.nombre;
          result.hidden = false;
          requestAnimationFrame(() => result.classList.add('is-on'));
        },
      });

      if (!run || run.aborted || token !== seq || app.state.abortAnim) return;
      await wait(2400);
      if (token !== seq || app.state.abortAnim) return;
      AppFlow.afterArea();
    }

    return { el, onShow };
  },
};

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

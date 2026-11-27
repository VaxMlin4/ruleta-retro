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
          <h1 class="plinko-question">¿QUÉ ÁREAS SERÁN LAS AFORTUNADAS?</h1>
        </header>
        <div class="plinko-viewport" id="ui4-board"></div>
        <div class="plinko-result" id="ui4-result" hidden>
          <span>Áreas seleccionadas</span>
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
      const board = el.querySelector('#ui4-board');
      const question = el.querySelector('.plinko-question');
      const result = el.querySelector('#ui4-result');
      const resultName = el.querySelector('#ui4-result-name');
      question.textContent = '¿QUÉ ÁREAS SERÁN LAS AFORTUNADAS?';
      result.hidden = true;
      result.classList.remove('is-on');
      if (board._plinkoStop) board._plinkoStop();

      const lote = activeLote(opts, app);
      const sorteo = lote[0] || opts.sorteo || app.state.currentSorteo;
      if (!sorteo || !sorteo.area) {
        app.beginRaffle();
        return;
      }

      el.querySelector('#ui4-prize').innerHTML = lote
        .map((item) => `<span style="color:${item.color}">${escapeHtml(item.premio && item.premio.nombre)}</span>`)
        .join('<i class="plinko-dot">·</i>');

      const snap = app.state.snapshot || (await app.refreshSnapshot());
      if (token !== seq || app.state.abortAnim) return;

      const winnerAreas = new Set(lote.map((item) => item.area && item.area.id));
      const eleg = {};
      for (const empleado of snap.empleados || []) {
        if (empleado.elegible) eleg[empleado.area] = (eleg[empleado.area] || 0) + 1;
      }
      let areas = (snap.areas || []).map((a) => ({
        id: a.id,
        nombre: a.nombre,
        dimmed: (eleg[a.nombre] || 0) <= 0 && !winnerAreas.has(a.id),
      }));
      lote.forEach((item) => {
        if (!areas.find((a) => a.id === item.area.id)) {
          areas.push({ id: item.area.id, nombre: item.area.nombre, dimmed: false });
        }
      });
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
      const key = ids + '@' + Math.round(width / 80) + '@texto2';
      if (!layout || layout._key !== key) {
        layout = PlinkoAnim.layoutBoard(areas, width);
        layout._key = key;
        app.state.plinkoLayout = layout;
      }

      const run = await PlinkoAnim.play(board, {
        areas,
        winnerId: sorteo.area.id,
        seed: sorteo.sorteoId || sorteo.secuencia || sorteo.area.id,
        balls: lote.map((item) => ({
          winnerId: item.area.id,
          color: item.color,
          seed: item.sorteoId || item.secuencia || item.area.id,
        })),
        layout,
        shouldAbort: () => token !== seq || !!app.state.abortAnim,
        onArrive() {
          if (token !== seq) return;
          resultName.innerHTML = lote
            .map((item) => {
              const ink = readableInk(item.color);
              return `<b class="plinko-area" style="background:${item.color};color:${ink};border-color:${item.color}">${escapeHtml(item.area.nombre)}</b>`;
            })
            .join('');
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

function readableInk(color) {
  const hex = String(color || '').replace('#', '');
  if (hex.length < 6) return '#FFF6E4';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const light = (r * 299 + g * 587 + b * 114) / 1000;
  return light > 140 ? '#241225' : '#FFF6E4';
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* global VinylAnim, AppFlow */
window.UI3 = {
  create(root, app) {
    const el = document.createElement('section');
    el.className = 'screen';
    el.id = 'screen-ui3';
    el.innerHTML = `
      <div class="disco-stage"></div>
      <div class="spotlight left"></div>
      <div class="spotlight right"></div>
      <div class="rainbow-arcs"></div>
      <div class="disco-ball"></div>
      <div class="disco-floor"></div>
      <div class="ruleta-stage">
        <p class="eyebrow">El gran sorteo</p>
        <h1 class="brand-title" style="font-size:clamp(1.25rem,2.8vw,2rem)">Disco y Destino <span class="retro" style="display:inline;font-size:0.7em">70's</span></h1>
        <div class="marquee"><span class="label" id="ui3-question" style="font-size:1rem;letter-spacing:0.12em">¿QUÉ PREMIO SALDRÁ?</span></div>
        <div class="ruleta-wheel-slot">
          <div class="ruleta-pointer" aria-hidden="true"></div>
          <div class="ruleta-wheel-wrap">
            <div id="ui3-wheel" style="width:100%;height:100%"></div>
          </div>
        </div>
      </div>
      <footer class="app-footer">
        <div class="footer-actions">
          <button type="button" class="btn-icon" data-fs title="Pantalla completa">⛶</button>
        </div>
      </footer>
      <div class="blocking-overlay" id="ui3-block"></div>
    `;
    root.appendChild(el);
    el.querySelector('[data-fs]').onclick = () => app.toggleFullscreen();

    async function onShow(opts = {}) {
      const sorteo = opts.sorteo || app.state.currentSorteo;
      if (!sorteo) {
        app.beginRaffle();
        return;
      }
      const question = el.querySelector('#ui3-question');
      question.textContent = '¿QUÉ PREMIO SALDRÁ?';
      const snap = app.state.snapshot || (await app.refreshSnapshot());
      let prizes = (snap.premios || []).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        agotado: Number(p.cantidad_disponible) <= 0 && p.id !== sorteo.premio.id,
      }));
      if (!prizes.find((p) => p.id === sorteo.premio.id)) {
        prizes = [{ id: sorteo.premio.id, nombre: sorteo.premio.nombre, agotado: false }, ...prizes];
      }
      if (!prizes.length) {
        prizes = [{ id: sorteo.premio.id, nombre: sorteo.premio.nombre }];
      }

      const host = el.querySelector('#ui3-wheel');
      await VinylAnim.spin(host, prizes, sorteo.premio.id, () => {
        question.textContent = sorteo.premio.nombre;
      });
      await wait(1200);
      AppFlow.afterPrize();
    }

    return { el, onShow };
  },
};

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

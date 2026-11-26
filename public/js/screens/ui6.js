/* global CelebrationAnim */
window.UI6 = {
  create(root, app) {
    const el = document.createElement('section');
    el.className = 'screen';
    el.id = 'screen-ui6';
    el.innerHTML = `
      <div class="disco-stage"></div>
      <div class="spotlight left"></div>
      <div class="spotlight right"></div>
      <div class="rainbow-arcs"></div>
      <div class="disco-ball"></div>
      <div class="disco-floor"></div>
      <div class="screen-content" id="ui6-content">
        <div class="glow-card celeb-card" id="ui6-card">
          <p class="eyebrow">¡Felicidades!</p>
          <p class="winner-name" id="ui6-name">—</p>
          <p class="area-line" id="ui6-area">Área</p>
          <p class="prize-line" id="ui6-prize">Premio</p>
          <p class="celeb-next" id="ui6-next" hidden>El siguiente premio comienza solo.</p>
          <div class="celeb-meter" id="ui6-meter" hidden>
            <span id="ui6-meter-fill"></span>
          </div>
          <div class="celeb-actions">
            <button type="button" class="btn btn-primary lg" id="ui6-continue">Continuar</button>
            <button type="button" class="btn btn-ghost" id="ui6-replay">Ver de nuevo</button>
          </div>
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
    el.querySelector('#ui6-continue').onclick = () => {
      app.state.ui6Epoch += 1;
      app.continueAfterCelebration({ next: !!app.state.marathon });
    };
    el.querySelector('#ui6-replay').onclick = () => {
      app.state.ui6Epoch += 1;
      app.replayCurrent();
    };

    async function onShow(opts = {}) {
      const sorteo = opts.sorteo || app.state.currentSorteo;
      if (!sorteo) {
        app.beginRaffle();
        return;
      }
      el.querySelector('#ui6-name').textContent = sorteo.empleado.nombre;
      el.querySelector('#ui6-area').textContent = `Área: ${sorteo.area.nombre}`;
      el.querySelector('#ui6-prize').textContent = `Premio: ${sorteo.premio.nombre}`;
      CelebrationAnim.burst(el.querySelector('#ui6-content'));

      const epoch = ++app.state.ui6Epoch;
      const remaining = app.state.snapshot?.stats?.unidadesDisponibles ?? 0;
      const marathon = !!app.state.marathon;
      const last = remaining <= 0;
      const next = el.querySelector('#ui6-next');
      const meter = el.querySelector('#ui6-meter');
      const btn = el.querySelector('#ui6-continue');
      const hold = 2200;
      next.hidden = !marathon;
      meter.hidden = !marathon;
      next.textContent = last
        ? 'En un momento pasamos a la gran final.'
        : 'El siguiente premio comienza solo.';
      btn.textContent = marathon ? (last ? 'Ver gran final' : 'Siguiente ahora') : 'Continuar';
      meter.classList.remove('is-run');
      if (!marathon) return;
      meter.style.setProperty('--celeb-wait', `${hold}ms`);
      void meter.offsetWidth;
      meter.classList.add('is-run');
      await wait(hold);
      if (epoch !== app.state.ui6Epoch || app.state.screen !== 'ui6' || !app.state.marathon) return;
      app.continueAfterCelebration({ next: true });
    }

    return { el, onShow };
  },
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

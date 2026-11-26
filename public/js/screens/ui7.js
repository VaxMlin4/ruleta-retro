window.UI7 = {
  create(root, app) {
    const el = document.createElement('section');
    el.className = 'screen';
    el.id = 'screen-ui7';
    el.innerHTML = `
      <div class="disco-stage"></div>
      <div class="spotlight left"></div>
      <div class="spotlight right"></div>
      <div class="rainbow-arcs"></div>
      <div class="disco-ball"></div>
      <div class="disco-floor"></div>
      <div class="screen-content">
        <p class="eyebrow">El gran sorteo</p>
        <h1 class="brand-title" style="font-size:clamp(1.8rem,4vw,3rem)">GRAN FINAL</h1>
        <p class="tagline">¡Gracias por participar!</p>
        <div class="glow-card final-card">
          <table class="final-head">
            <colgroup>
              <col class="c-num" />
              <col class="c-name" />
              <col class="c-area" />
              <col class="c-prize" />
            </colgroup>
            <thead><tr><th>#</th><th>Ganador</th><th>Área</th><th>Premio</th></tr></thead>
          </table>
          <div class="final-scroll">
            <table>
              <colgroup>
                <col class="c-num" />
                <col class="c-name" />
                <col class="c-area" />
                <col class="c-prize" />
              </colgroup>
              <tbody id="ui7-body"></tbody>
            </table>
          </div>
        </div>
        <div class="final-actions">
          <button type="button" class="btn btn-primary" id="ui7-export">⬇ Exportar Excel</button>
          <button type="button" class="btn btn-ghost" id="ui7-reset">Reiniciar evento</button>
        </div>
      </div>
      <footer class="app-footer">
        <div class="footer-actions">
          <button type="button" class="btn-icon" data-fs title="Pantalla completa">⛶</button>
        </div>
      </footer>
    `;
    root.appendChild(el);
    let stopScroll = null;
    let generation = 0;

    function haltScroll() {
      generation += 1;
      if (stopScroll) stopScroll();
      stopScroll = null;
    }

    function loopList(box, rows) {
      haltScroll();
      box.scrollTop = 0;
      const frame = requestAnimationFrame(() => {
        if (box.scrollHeight <= box.clientHeight + 2) return;
        const loopHeight = rows.reduce((sum, row) => sum + row.offsetHeight, 0);
        if (loopHeight < 8) return;
        rows.forEach((row) => {
          const copy = row.cloneNode(true);
          copy.style.opacity = '1';
          copy.style.transform = 'none';
          row.parentNode.appendChild(copy);
        });
        let last = performance.now();
        let raf = 0;
        let alive = true;
        const speed = 36;
        function blockWheel(event) {
          event.preventDefault();
        }
        box.addEventListener('wheel', blockWheel, { passive: false });
        function tick(now) {
          if (!alive) return;
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          box.scrollTop += speed * dt;
          if (box.scrollTop >= loopHeight) box.scrollTop -= loopHeight;
          raf = requestAnimationFrame(tick);
        }
        raf = requestAnimationFrame(tick);
        stopScroll = () => {
          alive = false;
          box.removeEventListener('wheel', blockWheel);
          cancelAnimationFrame(raf);
          cancelAnimationFrame(frame);
        };
      });
      stopScroll = () => cancelAnimationFrame(frame);
    }

    el.querySelector('[data-fs]').onclick = () => app.toggleFullscreen();
    el.querySelector('#ui7-export').onclick = () => app.exportWinners();
    el.querySelector('#ui7-reset').onclick = () => app.hardReset();

    async function onShow() {
      haltScroll();
      const gen = generation;
      await app.refreshSnapshot();
      if (gen !== generation) return;
      const sorteos = [...(app.state.snapshot?.sorteos || [])].reverse(); // chronological
      const body = el.querySelector('#ui7-body');
      body.innerHTML = sorteos
        .map(
          (s) =>
            `<tr><td>${s.secuencia}</td><td>${s.empleado}</td><td>${s.area}</td><td>${s.premio}</td></tr>`
        )
        .join('');
      const rows = [...body.querySelectorAll('tr')];
      loopList(el.querySelector('.final-scroll'), rows);
    }

    return { el, onShow, onHide: haltScroll };
  },
};

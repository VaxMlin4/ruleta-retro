/* global gsap, VinylAnim */
window.UI2 = {
  create(root, app) {
    const el = document.createElement('section');
    el.className = 'screen';
    el.id = 'screen-ui2';
    el.innerHTML = `
      <div class="disco-stage"></div>
      <div class="spotlight left"></div>
      <div class="spotlight right"></div>
      <div class="rainbow-arcs"></div>
      <div class="disco-ball"></div>
      <div class="disco-floor"></div>
      <div class="escenario-layout" id="ui2-layout">
        <aside class="glow-card side-panel" id="ui2-left">
          <h3>Participantes</h3>
          <ul class="side-list" id="ui2-empleados"></ul>
          <button type="button" class="panel-more btn-link" id="ui2-all-emp">Ver todos los participantes</button>
        </aside>
        <div class="escenario-center">
          <p class="eyebrow">El gran sorteo</p>
          <h1 class="brand-title" style="font-size:clamp(1.5rem,3.6vw,2.4rem)">DISCO Y DESTINO<span class="retro">70's</span></h1>
          <div class="marquee">
            <span class="label">PREMIOS DISPONIBLES</span>
            <span class="value" id="ui2-premios-count">0 / 0</span>
          </div>
          <div class="vinyl-wrap vinyl-spinning" id="ui2-vinyl"></div>
          <button type="button" class="btn btn-primary lg" id="ui2-start">¡Iniciar sorteo!</button>
        </div>
        <aside class="glow-card side-panel" id="ui2-right">
          <h3>Premios</h3>
          <ul class="side-list" id="ui2-premios"></ul>
          <button type="button" class="panel-more btn-link" id="ui2-all-prem">Ver inventario</button>
        </aside>
      </div>
      <footer class="app-footer">
        <div class="footer-mid">
          <button type="button" class="btn-link" id="ui2-hist">Historial de ganadores</button>
          <span id="ui2-entregados">0 premios entregados</span>
        </div>
        <div class="footer-actions">
          <button type="button" class="btn-icon" data-fs title="Pantalla completa">⛶</button>
        </div>
      </footer>
    `;
    root.appendChild(el);

    const vinylHost = el.querySelector('#ui2-vinyl');
    VinylAnim.mountStatic(vinylHost);

    el.querySelector('[data-fs]').onclick = () => app.toggleFullscreen();
    el.querySelector('#ui2-start').onclick = async () => {
      const snap = app.state.snapshot;
      if (!snap?.canDraw?.ok) {
        if (snap?.canDraw?.goFinal || snap?.stats?.unidadesDisponibles <= 0) {
          await app.goFinal();
          return;
        }
        await app.confirm({
          title: 'No disponible',
          body: snap?.canDraw?.reason || 'No se puede iniciar un sorteo ahora.',
          okText: 'Entendido',
          cancelText: 'Cerrar',
        });
        return;
      }
      // Transition: hide sides, enlarge vinyl
      el.querySelector('#ui2-layout').classList.add('hidden-sides');
      await app.runDrawCycle();
    };
    el.querySelector('#ui2-all-emp').onclick = () => {
      const list = (app.state.snapshot?.empleados || [])
        .map(
          (e) =>
            `<li class="${e.atenuado ? 'atenuado' : ''}"><span class="dot"></span>${e.nombre} <em style="opacity:.6">(${e.area})</em>${e.atenuado ? '<span class="check"></span>' : ''}</li>`
        )
        .join('');
      app.openPanel('Participantes', `<ul class="side-list">${list}</ul>`);
    };
    el.querySelector('#ui2-all-prem').onclick = () => {
      const list = (app.state.snapshot?.premios || [])
        .map(
          (p) =>
            `<li>${p.nombre}<span class="qty">${p.cantidad_disponible} / ${p.cantidad_inicial}</span></li>`
        )
        .join('');
      app.openPanel('Inventario de premios', `<ul class="side-list">${list}</ul>`);
    };
    el.querySelector('#ui2-hist').onclick = () => {
      const rows = (app.state.snapshot?.sorteos || [])
        .map(
          (s) =>
            `<tr><td>${s.secuencia}</td><td>${s.empleado}</td><td>${s.area}</td><td>${s.premio}</td></tr>`
        )
        .join('');
      app.openPanel(
        'Historial de ganadores',
        `<table style="width:100%;font-size:.9rem"><thead><tr><th>#</th><th>Colaborador</th><th>Área</th><th>Premio</th></tr></thead><tbody>${rows || '<tr><td colspan=4>Sin ganadores aún</td></tr>'}</tbody></table>`
      );
    };

    async function onShow() {
      el.querySelector('#ui2-layout').classList.remove('hidden-sides');
      await app.refreshSnapshot();
      render();
    }

    function render() {
      const snap = app.state.snapshot;
      if (!snap) return;
      const { stats, empleados, premios } = snap;
      el.querySelector('#ui2-premios-count').textContent =
        `${stats.unidadesDisponibles} / ${stats.unidadesIniciales}`;
      el.querySelector('#ui2-entregados').textContent =
        `${stats.entregados} premios entregados`;

      const empList = el.querySelector('#ui2-empleados');
      empList.innerHTML = empleados
        .slice(0, 14)
        .map(
          (e) =>
            `<li class="${e.atenuado ? 'atenuado' : ''}"><span class="dot"></span><span>${e.nombre}</span>${e.atenuado ? '<span class="check"></span>' : ''}</li>`
        )
        .join('');

      const premList = el.querySelector('#ui2-premios');
      premList.innerHTML = premios
        .map(
          (p) =>
            `<li class="${p.cantidad_disponible <= 0 ? 'atenuado' : ''}">${p.nombre}<span class="qty">${p.cantidad_disponible}</span></li>`
        )
        .join('');

      const btn = el.querySelector('#ui2-start');
      const can = snap.canDraw?.ok;
      btn.disabled = !can && !snap.canDraw?.goFinal;
      if (stats.unidadesDisponibles <= 0) {
        btn.textContent = 'Ver gran final';
        btn.disabled = false;
      } else {
        btn.textContent = '¡Iniciar sorteo!';
      }
    }

    return { el, onShow };
  },
};

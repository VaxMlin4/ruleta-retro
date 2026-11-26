/* global API, gsap */
window.UI1 = {
  create(root, app) {
    const el = document.createElement('section');
    el.className = 'screen';
    el.id = 'screen-ui1';
    el.innerHTML = `
      <div class="disco-stage"></div>
      <div class="spotlight left"></div>
      <div class="spotlight right"></div>
      <div class="rainbow-arcs"></div>
      <div class="disco-ball"></div>
      <div class="disco-floor"></div>
      <div class="sparkle" style="top:18%;left:28%"></div>
      <div class="sparkle" style="top:22%;right:32%;width:8px;height:8px"></div>
      <div class="sparkle" style="top:40%;left:18%;width:7px;height:7px"></div>
      <div class="screen-content" id="ui1-content"></div>
      <footer class="app-footer">
        <div class="footer-actions">
          <button type="button" class="btn-icon" data-fs title="Pantalla completa">⛶</button>
        </div>
      </footer>
    `;
    root.appendChild(el);

    el.querySelector('[data-fs]').onclick = () => app.toggleFullscreen();

    const content = el.querySelector('#ui1-content');

    async function onShow(opts = {}) {
      const phase = opts.phase || 'A';
      app.state.ui1Phase = phase;
      if (phase === 'A') return playPortada();
      if (phase === 'B') return renderB();
      if (phase === 'C') return renderC();
      // auto-route
      const st = await API.prepStatus();
      app.state.prep = st;
      if (st.imports.participantesOk && st.imports.premiosOk) return renderC();
      return renderB();
    }

    function playPortada() {
      app.state.ui1Phase = 'A';
      app.updateBackButton?.();
      content.innerHTML = `
        <p class="eyebrow">El gran sorteo</p>
        <h1 class="brand-title" style="font-size:clamp(2rem,6.4vw,4.4rem)">DISCO Y DESTINO<span class="retro">70's</span></h1>
        <p class="tagline" id="portada-tag" style="opacity:0">¡Que gire el disco, que baile la suerte!</p>
      `;
      const title = content.querySelector('.brand-title');
      const tag = content.querySelector('#portada-tag');
      gsap.set(title, { opacity: 0, scale: 0.85, y: 20 });
      gsap
        .timeline()
        .to(title, { opacity: 1, scale: 1, y: 0, duration: 1.1, ease: 'power2.out' })
        .to(tag, { opacity: 1, duration: 0.8 }, '+=0.4')
        .to(content, { opacity: 0, duration: 0.5, delay: 1.2, onComplete: afterPortada });
    }

    async function afterPortada() {
      content.style.opacity = 1;
      const st = await API.prepStatus();
      app.state.prep = st;
      const ev = st.event;
      if (ev?.estado === 'en_curso') {
        await app.refreshSnapshot();
        app.beginRaffle();
        return;
      }
      if (ev?.estado === 'finalizado') {
        await app.refreshSnapshot();
        app.show('ui7');
        return;
      }
      if (st.imports.participantesOk && st.imports.premiosOk) renderC();
      else renderB();
    }

    function renderB() {
      app.state.ui1Phase = 'B';
      app.updateBackButton?.();
      content.innerHTML = `
        <p class="eyebrow">El gran sorteo</p>
        <h1 class="brand-title" style="font-size:clamp(1.7rem,4.4vw,2.8rem)">DISCO Y DESTINO<span class="retro">70's</span></h1>
        <p class="tagline">¡Que gire el disco, que baile la suerte!</p>
        <p class="subtag">Prepara los archivos para comenzar el gran sorteo</p>
        <div class="upload-row">
          <div class="glow-card upload-card" data-kind="empleados">
            <h3>Participantes</h3>
            <div class="dropzone" data-drop="empleados">
              <p class="hint">Arrastra tu Excel aquí .xlsx</p>
              <button type="button" class="btn btn-primary" data-pick="empleados">Seleccionar archivo</button>
              <input type="file" accept=".xlsx,.xls" hidden data-file="empleados" />
            </div>
            <p class="upload-meta">ID · Nombre · Área</p>
            <p class="upload-status" data-status="empleados"></p>
            <p style="text-align:center;margin-top:0.4rem"><a class="btn-link" href="/templates/participantes.xlsx">Descargar plantilla</a></p>
          </div>
          <div class="glow-card upload-card" data-kind="premios">
            <h3>Premios</h3>
            <div class="dropzone" data-drop="premios">
              <p class="hint">Arrastra tu Excel aquí .xlsx</p>
              <button type="button" class="btn btn-primary" data-pick="premios">Seleccionar archivo</button>
              <input type="file" accept=".xlsx,.xls" hidden data-file="premios" />
            </div>
            <p class="upload-meta">ID · Artículo · Cantidad</p>
            <p class="upload-status" data-status="premios"></p>
            <p style="text-align:center;margin-top:0.4rem"><a class="btn-link" href="/templates/premios.xlsx">Descargar plantilla</a></p>
          </div>
        </div>
      `;
      wireUploads();
      refreshUploadStatus();
      gsap.from(content.querySelectorAll('.upload-card'), { y: 24, opacity: 0, stagger: 0.15, duration: 0.6 });
    }

    function wireUploads() {
      content.querySelectorAll('[data-pick]').forEach((btn) => {
        btn.onclick = () => content.querySelector(`[data-file="${btn.dataset.pick}"]`).click();
      });
      content.querySelectorAll('[data-file]').forEach((input) => {
        input.onchange = () => {
          if (input.files[0]) handleFile(input.dataset.file, input.files[0]);
        };
      });
      content.querySelectorAll('[data-drop]').forEach((dz) => {
        dz.addEventListener('dragover', (e) => {
          e.preventDefault();
          dz.classList.add('dragover');
        });
        dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
        dz.addEventListener('drop', (e) => {
          e.preventDefault();
          dz.classList.remove('dragover');
          const f = e.dataTransfer.files[0];
          if (f) handleFile(dz.dataset.drop, f);
        });
      });
    }

    async function handleFile(kind, file) {
      const status = content.querySelector(`[data-status="${kind}"]`);
      const input = content.querySelector(`[data-file="${kind}"]`);
      if (input) input.value = '';
      status.className = 'upload-status';
      status.textContent = '';
      try {
        if (!app.state.prep) {
          app.state.prep = await API.prepStatus();
        }
        const estado = app.state.prep.event && app.state.prep.event.estado;
        let replace = false;
        if (estado === 'en_curso' || estado === 'finalizado') {
          const ok = await app.confirm({
            title: '¿Reemplazar los archivos?',
            body: 'El sorteo ya comenzó. Al cargar un Excel nuevo se borran los ganadores y el evento vuelve a preparación. El otro archivo se conserva.',
            okText: 'Reemplazar',
          });
          if (!ok) return;
          replace = true;
        }
        status.textContent = 'Validando…';
        const res =
          kind === 'empleados'
            ? await API.importEmpleados(file, { replace })
            : await API.importPremios(file, { replace });
        if (!res.ok) {
          status.classList.add('err');
          status.textContent = formatImportErrors(res);
          return;
        }
        status.classList.add('ok');
        status.textContent =
          kind === 'empleados'
            ? `${res.participantes} participantes · ${res.areas} áreas`
            : `${res.premios} premios · ${res.unidadesPremios} unidades`;
        const st = await API.prepStatus();
        app.state.prep = st;
        if (st.imports.participantesOk && st.imports.premiosOk) {
          setTimeout(() => renderC(), 450);
        }
      } catch (e) {
        status.classList.add('err');
        status.textContent = (e.data && formatImportErrors(e.data)) || e.message;
      }
    }

    function formatImportErrors(payload) {
      const errors = payload && payload.errors;
      if (Array.isArray(errors) && errors.length) {
        return errors
          .map((er) => (er.row ? `Fila ${er.row}: ${er.message}` : er.message))
          .filter(Boolean)
          .join(' · ');
      }
      return (payload && payload.message) || 'Error al leer el archivo';
    }

    async function refreshUploadStatus() {
      const st = await API.prepStatus();
      app.state.prep = st;
      const se = content.querySelector('[data-status="empleados"]');
      const sp = content.querySelector('[data-status="premios"]');
      if (se && st.imports.participantesOk) {
        se.className = 'upload-status ok';
        se.textContent = `${st.imports.participantes} participantes`;
      }
      if (sp && st.imports.premiosOk) {
        sp.className = 'upload-status ok';
        sp.textContent = `${st.imports.premios} premios · ${st.imports.unidadesPremios} unidades`;
      }
    }

    async function renderC() {
      app.state.ui1Phase = 'C';
      app.updateBackButton?.();
      const st = await API.prepStatus();
      app.state.prep = st;
      const v = st.viability;
      const ok = v && v.ok;
      content.innerHTML = `
        <p class="eyebrow">El gran sorteo</p>
        <h1 class="brand-title" style="font-size:clamp(1.7rem,4.4vw,2.8rem)">DISCO Y DESTINO<span class="retro">70's</span></h1>
        <p class="tagline">¡Todo listo para comenzar!</p>
        <p class="subtag">Los archivos del evento se han validado correctamente.</p>
        <div class="summary-row">
          <div class="glow-card stat-card"><div class="num" data-count="${st.imports.participantes}">0</div><div class="label">Participantes</div></div>
          <div class="glow-card stat-card"><div class="num" data-count="${st.imports.areas}">0</div><div class="label">Áreas</div></div>
          <div class="glow-card stat-card"><div class="num" data-count="${st.imports.unidadesPremios}">0</div><div class="label">Premios</div></div>
        </div>
        ${ok ? '' : `<div class="viability-pill bad">${(v && v.errors && v.errors[0]) || 'No viable'}</div>`}
        <button type="button" class="btn btn-primary lg" id="btn-start" ${ok ? '' : 'disabled'}>¡Comenzar el sorteo!</button>
        <div class="summary-links">
          <button type="button" class="btn-link" id="btn-change">Cambiar archivos</button>
        </div>
      `;
      content.querySelector('#btn-start').onclick = () => app.startEvent();
      content.querySelector('#btn-change').onclick = () => renderB();
      animateCounters();
      gsap.from(content.querySelectorAll('.stat-card'), { y: 20, opacity: 0, stagger: 0.12, duration: 0.55 });
    }

    function animateCounters() {
      content.querySelectorAll('[data-count]').forEach((node) => {
        const target = Number(node.dataset.count) || 0;
        const obj = { n: 0 };
        gsap.to(obj, {
          n: target,
          duration: 1.1,
          ease: 'power2.out',
          onUpdate: () => {
            node.textContent = Math.round(obj.n);
          },
        });
      });
    }

    return { el, onShow };
  },
};

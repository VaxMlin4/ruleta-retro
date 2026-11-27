/* global API, gsap, UI1, UI2, UI3, UI4, UI5, UI6, UI7, DiscoBall */
(() => {
  const state = {
    screen: 'ui1',
    ui1Phase: 'A',
    muted: true,
    snapshot: null,
    prep: null,
    currentSorteo: null,
    currentLote: null,
    animating: false,
    replayMode: false,
    abortAnim: false,
    marathon: false,
    ui6Epoch: 0,
    celebrationLock: false,
  };

  const appEl = document.getElementById('app');
  const screens = {};

  function mount() {
    screens.ui1 = UI1.create(appEl, api);
    screens.ui2 = UI2.create(appEl, api);
    screens.ui3 = UI3.create(appEl, api);
    screens.ui4 = UI4.create(appEl, api);
    screens.ui5 = UI5.create(appEl, api);
    screens.ui6 = UI6.create(appEl, api);
    screens.ui7 = UI7.create(appEl, api);
    if (window.DiscoBall) DiscoBall.mount(appEl);
    wireChrome();
    boot();
  }

  const api = {
    state,
    show,
    confirm,
    openPanel,
    closePanel,
    toast,
    setMuted,
    toggleFullscreen,
    refreshSnapshot,
    startEvent,
    beginRaffle,
    runDrawCycle,
    replayCurrent,
    continueAfterCelebration,
    goFinal,
    exportWinners,
    hardReset,
    goBack,
    updateBackButton,
  };

  function show(name, opts = {}) {
    const prev = screens[state.screen];
    if (prev && state.screen !== name && prev.onHide) prev.onHide();
    state.screen = name;
    if (name === 'ui1' && opts.phase) state.ui1Phase = opts.phase;
    Object.entries(screens).forEach(([k, s]) => {
      if (s.el) s.el.classList.toggle('active', k === name);
    });
    const scr = screens[name];
    if (scr && scr.onShow) scr.onShow(opts);
    updateFooter();
    updateBackButton();
  }

  function wireChrome() {
    document.getElementById('modal-cancel').onclick = () => hideModal(false);
    document.getElementById('modal-ok').onclick = () => hideModal(true);
    document.getElementById('panel-close').onclick = closePanel;
    document.querySelector('.panel-backdrop').onclick = closePanel;
    document.getElementById('btn-back').onclick = () => goBack();
  }

  function updateBackButton() {
    const btn = document.getElementById('btn-back');
    if (!btn) return;
    const visible = canGoBack();
    btn.hidden = !visible;
  }

  function canGoBack() {
    const s = state.screen;
    if (s === 'ui1') return state.ui1Phase === 'C'; // C → B; A/B sin atrás
    if (s === 'ui2' || s === 'ui6' || s === 'ui7') return true;
    if (s === 'ui4') return false;
    if (s === 'ui3' || s === 'ui5') return true;
    return false;
  }

  async function goBack() {
    const s = state.screen;

    if (s === 'ui1') {
      if (state.ui1Phase === 'C') {
        show('ui1', { phase: 'B' });
        return;
      }
      // B: sin pantalla previa útil → no-op
      return;
    }

    if (s === 'ui2') {
      const ev = state.snapshot?.event || state.prep?.event;
      if (ev?.estado === 'en_curso' || ev?.estado === 'finalizado') {
        const ok = await confirm({
          title: '¿Volver a preparación?',
          body: 'El evento ya está en curso. Si cambias los Excel se borran los ganadores y el sorteo vuelve a preparación.',
          okText: 'Volver',
        });
        if (!ok) return;
        show('ui1', { phase: 'C' });
        return;
      }
      show('ui1', { phase: 'C' });
      return;
    }

    if (s === 'ui3' || s === 'ui4' || s === 'ui5') {
      const ok = await confirm({
        title: '¿Salir de la animación?',
        body: 'Volverás al escenario. El resultado del sorteo ya quedó guardado.',
        okText: 'Salir',
      });
      if (!ok) return;
      state.abortAnim = true;
      state.animating = false;
      state.marathon = false;
      try {
        await API.continueDraw();
      } catch (_) {
        /* */
      }
      await refreshSnapshot();
      const units = state.snapshot?.stats?.unidadesDisponibles;
      if (state.snapshot?.event?.estado === 'finalizado' || units <= 0) {
        show('ui7');
      } else {
        show('ui1', { phase: 'C' });
      }
      return;
    }

    if (s === 'ui6') {
      state.ui6Epoch += 1;
      state.marathon = false;
      await continueAfterCelebration({ next: false });
      return;
    }

    if (s === 'ui7') {
      const ok = await confirm({
        title: '¿Volver al escenario?',
        body: 'El evento ya finalizó; no habrá nuevos sorteos.',
        okText: 'Volver',
      });
      if (!ok) return;
      show('ui1', { phase: 'C' });
    }
  }

  let modalResolve = null;
  function confirm({ title, body, okText = 'Confirmar', cancelText = 'Cancelar' }) {
    const root = document.getElementById('modal-root');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').textContent = body;
    document.getElementById('modal-ok').textContent = okText;
    document.getElementById('modal-cancel').textContent = cancelText;
    root.hidden = false;
    return new Promise((resolve) => {
      modalResolve = resolve;
    });
  }
  function hideModal(ok) {
    document.getElementById('modal-root').hidden = true;
    if (modalResolve) modalResolve(ok);
    modalResolve = null;
  }

  function openPanel(title, html) {
    document.getElementById('panel-title').textContent = title;
    document.getElementById('panel-body').innerHTML = html;
    document.getElementById('panel-root').hidden = false;
  }
  function closePanel() {
    document.getElementById('panel-root').hidden = true;
  }

  function toast(msg) {
    // lightweight in-app: reuse modal body briefly via panel if needed
    console.info('[Ruleta]', msg);
  }

  function setMuted(v) {
    state.muted = v;
    updateFooter();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function updateFooter() {
    document.querySelectorAll('[data-mute]').forEach((btn) => {
      btn.textContent = state.muted ? '🔇' : '🔊';
      btn.title = state.muted ? 'Sonido silenciado' : 'Sonido activo';
    });
  }

  async function refreshSnapshot() {
    state.snapshot = await API.snapshot();
    return state.snapshot;
  }

  async function boot() {
    try {
      state.prep = await API.prepStatus();
      const ev = state.prep.event;
      if (!ev) {
        show('ui1', { phase: 'A' });
        return;
      }
      if (ev.estado === 'finalizado') {
        await refreshSnapshot();
        show('ui7');
        return;
      }
      if (ev.estado === 'en_curso') {
        await refreshSnapshot();
        if (ev.animacionEnCurso && (state.snapshot.lote || []).length) {
          state.currentLote = state.snapshot.lote;
          state.currentSorteo = state.snapshot.lote[0];
          state.replayMode = true;
          show('ui3', { lote: state.currentLote, sorteo: state.currentSorteo, replay: true });
        } else if (ev.animacionEnCurso && ev.sorteoActualId) {
          state.currentSorteo = state.snapshot.sorteoActual;
          state.currentLote = state.currentSorteo ? [state.currentSorteo] : null;
          state.replayMode = true;
          show('ui3', { lote: state.currentLote, sorteo: state.currentSorteo, replay: true });
        } else {
          await beginRaffle();
        }
        return;
      }
      // borrador / validado / listo → portada then B/C
      show('ui1', { phase: 'A' });
    } catch (e) {
      console.error(e);
      show('ui1', { phase: 'A' });
    }
  }

  async function startEvent() {
    try {
      const res = await API.startEvent();
      if (!res.ok) {
        await confirm({
          title: 'No viable',
          body: (res.errors || [res.message]).join('\n'),
          okText: 'Entendido',
          cancelText: 'Cerrar',
        });
        return;
      }
      await refreshSnapshot();
      await runDrawCycle();
    } catch (e) {
      await confirm({
        title: 'Error al iniciar',
        body: (e.data && (e.data.errors || []).join?.('\n')) || e.message,
        okText: 'Entendido',
        cancelText: 'Cerrar',
      });
    }
  }

  async function runDrawCycle(opts = {}) {
    if (state.animating) return;
    if (!opts.skipConfirm) state.marathon = true;
    if (!state.marathon) return;

    state.animating = true;
    state.replayMode = false;
    state.abortAnim = false;
    try {
      const result = await API.draw();
      if (!result.ok) {
        state.animating = false;
        state.marathon = false;
        if (result.goFinal || (result.data && result.data.goFinal)) {
          await goFinal();
          return;
        }
        await confirm({
          title: 'No se pudo sortear',
          body: result.message || 'Error en el motor. El evento NO se marcó como éxito.',
          okText: 'Entendido',
          cancelText: 'Cerrar',
        });
        show('ui1', { phase: 'C' });
        return;
      }
      state.currentLote = result.lote && result.lote.length ? result.lote : [result];
      state.currentSorteo = state.currentLote[0];
      await refreshSnapshot();
      show('ui3', { lote: state.currentLote, sorteo: state.currentSorteo });
    } catch (e) {
      state.animating = false;
      state.marathon = false;
      const data = e.data || {};
      if (data.goFinal) {
        await goFinal();
        return;
      }
      await confirm({
        title: 'Fallo del sorteo',
        body: data.message || e.message || 'El motor no entregó premio. No se marcó éxito.',
        okText: 'Entendido',
        cancelText: 'Cerrar',
      });
      await refreshSnapshot();
      show('ui1', { phase: 'C' });
    }
  }

  async function beginRaffle() {
    if (state.animating) return;
    await refreshSnapshot();
    const ev = state.snapshot?.event;
    if (ev?.estado === 'finalizado') {
      show('ui7');
      return;
    }
    if (ev?.estado !== 'en_curso') {
      show('ui1', { phase: 'C' });
      return;
    }
    await runDrawCycle();
  }

  async function replayCurrent() {
    if (!state.currentSorteo) return;
    state.replayMode = true;
    state.animating = true;
    state.abortAnim = false;
    show('ui3', { lote: state.currentLote, sorteo: state.currentSorteo, replay: true });
  }

  async function continueAfterCelebration(opts = {}) {
    if (state.celebrationLock) return;
    state.celebrationLock = true;
    const wantsNext = !!opts.next;
    try {
      const out = await API.continueDraw();
      state.animating = false;
      state.replayMode = false;
      await refreshSnapshot();
      const done =
        out.finalized ||
        state.snapshot.event.estado === 'finalizado' ||
        state.snapshot.stats.unidadesDisponibles <= 0;
      if (done) {
        state.marathon = false;
        show('ui7');
        return;
      }
      if (wantsNext && state.marathon && !state.abortAnim) {
        await runDrawCycle({ skipConfirm: true });
        return;
      }
      state.marathon = false;
      show('ui1', { phase: 'C' });
    } catch (e) {
      state.animating = false;
      state.marathon = false;
      show('ui1', { phase: 'C' });
    } finally {
      state.celebrationLock = false;
    }
  }

  async function goFinal() {
    try {
      await API.finalize();
    } catch (_) {
      /* */
    }
    state.animating = false;
    state.marathon = false;
    await refreshSnapshot();
    show('ui7');
  }

  function exportWinners() {
    window.location.href = API.exportUrl;
  }

  async function hardReset() {
    const a = await confirm({
      title: 'Reiniciar evento',
      body: 'Esto borrará participantes, premios y ganadores. ¿Continuar?',
      okText: 'Sí, continuar',
    });
    if (!a) return;
    const b = await confirm({
      title: 'Confirmación final',
      body: 'Última confirmación: se borrará TODO el progreso del evento.',
      okText: 'Borrar todo',
    });
    if (!b) return;
    await API.reset();
    state.currentSorteo = null;
    state.currentLote = null;
    state.animating = false;
    state.marathon = false;
    state.prep = await API.prepStatus();
    show('ui1', { phase: 'B' });
  }

  // Advance helpers for animation chain
  window.AppFlow = {
    afterPrize() {
      if (state.abortAnim) return;
      show('ui4', { lote: state.currentLote, sorteo: state.currentSorteo });
    },
    afterArea() {
      if (state.abortAnim) return;
      show('ui5', { lote: state.currentLote, sorteo: state.currentSorteo });
    },
    afterEmployee() {
      if (state.abortAnim) return;
      show('ui6', { lote: state.currentLote, sorteo: state.currentSorteo });
    },
  };

  mount();
})();

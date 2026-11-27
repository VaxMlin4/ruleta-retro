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
        <div class="prize-picks" id="ui3-picks"></div>
        <aside class="prize-board" id="ui3-board-left" aria-label="Premios disponibles, lado izquierdo"></aside>
        <div class="ruleta-wheel-slot">
          <div class="ruleta-pointer" aria-hidden="true"></div>
          <div class="ruleta-wheel-wrap">
            <div id="ui3-wheel" style="width:100%;height:100%"></div>
          </div>
        </div>
        <aside class="prize-board" id="ui3-board-right" aria-label="Premios disponibles, lado derecho"></aside>
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
      const lote = activeLote(opts, app);
      const sorteo = lote[0] || opts.sorteo || app.state.currentSorteo;
      if (!sorteo) {
        app.beginRaffle();
        return;
      }
      const question = el.querySelector('#ui3-question');
      question.textContent = '¿QUÉ PREMIO SALDRÁ?';
      const snap = app.state.snapshot || (await app.refreshSnapshot());
      const prizes = wheelPrizes(snap.premios || [], lote);
      const picks = el.querySelector('#ui3-picks');
      const inks = ['#241225', '#241225', '#FFE5B8'];
      picks.innerHTML = lote
        .map(
          (item, index) =>
            `<div class="prize-pick" hidden data-index="${index}" style="--draw-color:${item.color};--draw-ink:${inks[index % inks.length]}"></div>`
        )
        .join('');

      paintBoards(el, snap.premios || [], lote);
      const host = el.querySelector('#ui3-wheel');
      for (let i = 0; i < lote.length; i += 1) {
        if (app.state.abortAnim) return;
        question.textContent = '¿QUÉ PREMIO SALDRÁ?';
        const winnerId = prizeKey(lote[i].premio && lote[i].premio.nombre);
        const zoom = i === 0 ? 'in' : i === 2 ? 'out' : 'hold';
        const direction = i % 2 === 0 ? -1 : 1;
        await VinylAnim.spin(host, prizes, winnerId, () => {
          const box = picks.children[i];
          if (box) {
            box.hidden = false;
            box.classList.add('is-on');
            box.innerHTML = `<span>${esc(lote[i].premio.nombre)}</span>`;
          }
          question.textContent = lote[i].premio.nombre;
        }, { duration: i === 0 ? 6.2 : 5.1, spins: 4, zoom, direction });
        if (app.state.abortAnim) return;
        await wait(i === lote.length - 1 ? 900 : 650);
      }
      if (app.state.abortAnim) return;
      AppFlow.afterPrize();
    }

    return { el, onShow };
  },
};

function activeLote(opts, app) {
  const colors = ['#FFC354', '#F47D20', '#912C70'];
  const raw = opts.lote && opts.lote.length
    ? opts.lote
    : (app.state.currentLote && app.state.currentLote.length ? app.state.currentLote : null);
  if (raw) {
    return raw.map((item, index) => Object.assign({}, item, { color: colors[index % colors.length] }));
  }
  const one = opts.sorteo || app.state.currentSorteo;
  return one ? [Object.assign({}, one, { color: one.color || colors[0] })] : [];
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function prizeKey(nombre) {
  return normName(nombre) || 'premio';
}

function wheelPrizes(premios, lote) {
  return roundStock(premios, lote).map((row) => ({
    id: prizeKey(row.nombre),
    nombre: row.nombre,
    pinned: row.enSorteo,
    agotado: row.disponible <= 0,
  }));
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function groupPrizes(premios) {
  const map = new Map();
  (premios || []).forEach((p) => {
    const nombre = String(p.nombre || '').trim();
    const key = normName(nombre);
    if (!key) return;
    let row = map.get(key);
    if (!row) {
      row = { nombre, disponible: 0 };
      map.set(key, row);
    }
    row.disponible += Math.max(0, Number(p.cantidad_disponible) || 0);
  });
  return [...map.values()].sort((a, b) => {
    const ao = a.disponible <= 0 ? 1 : 0;
    const bo = b.disponible <= 0 ? 1 : 0;
    if (ao !== bo) return ao - bo;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
}

function roundStock(premios, lote) {
  const drawn = new Map();
  (lote || []).forEach((item) => {
    const nombre = item.premio && item.premio.nombre;
    const key = normName(nombre);
    if (!key) return;
    const current = drawn.get(key) || { nombre: String(nombre).trim(), extra: 0 };
    current.extra += 1;
    drawn.set(key, current);
  });
  const rows = groupPrizes(premios).map((row) => {
    const key = normName(row.nombre);
    const extra = drawn.get(key);
    if (extra) drawn.delete(key);
    const disponible = row.disponible + (extra ? extra.extra : 0);
    return { nombre: row.nombre, disponible, enSorteo: !!extra };
  });
  drawn.forEach((extra) => {
    rows.push({ nombre: extra.nombre, disponible: extra.extra, enSorteo: true });
  });
  rows.sort((a, b) => {
    const ao = a.disponible <= 0 ? 1 : 0;
    const bo = b.disponible <= 0 ? 1 : 0;
    if (ao !== bo) return ao - bo;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
  return rows;
}

function paintBoards(root, premios, lote) {
  const rows = roundStock(premios, lote);
  const total = rows.reduce((sum, row) => sum + row.disponible, 0);
  const left = [];
  const right = [];
  rows.forEach((row, i) => (i % 2 === 0 ? left : right).push(row));
  fillBoard(root.querySelector('#ui3-board-left'), left, total);
  fillBoard(root.querySelector('#ui3-board-right'), right, total);
}

function fillBoard(host, items, total) {
  if (!host) return;
  const rows = items
    .map((it) => {
      const out = it.disponible <= 0;
      return `<li class="prize-row${out ? ' is-out' : ''}">
        <span class="name" title="${esc(it.nombre)}">${esc(it.nombre)}</span>
        <span class="qty">${it.disponible}</span>
      </li>`;
    })
    .join('');
  host.hidden = items.length === 0;
  host.innerHTML = `
    <div class="prize-board-head">
      <p class="prize-board-kicker">Quedan</p>
      <p class="prize-board-total">${total}</p>
    </div>
    <div class="prize-board-window">
      <div class="prize-board-track">
        <ul class="prize-board-list">${rows}</ul>
      </div>
    </div>
  `;
  const win = host.querySelector('.prize-board-window');
  const track = host.querySelector('.prize-board-track');
  const list = host.querySelector('.prize-board-list');
  if (win && track && list && list.scrollHeight > win.clientHeight + 6) {
    const clone = list.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.appendChild(clone);
    track.style.animationDuration = `${Math.max(16, items.length * 1.4)}s`;
    track.classList.add('is-rolling');
  }
}

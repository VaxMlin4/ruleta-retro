/* global gsap */
window.VinylAnim = {
  mountStatic(host) {
    host.innerHTML = this._vinylSvg(false);
  },

  mountWheel(host, prizes, winnerId, opts = {}) {
    const shown = this._shownPrizes(prizes, winnerId);
    const n = Math.max(shown.length, 1);
    const colors = ['#FFE5B8', '#912C70', '#481D40', '#F47D20', '#FFC354', '#6b2048', '#c45a20'];
    const paths = [];
    const labels = [];
    const clips = [];
    const chord = Math.max(26, 2 * 126 * Math.sin(Math.PI / n) * 0.72);
    const band = 46;
    shown.forEach((p, i) => {
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
      const large = n > 1 && 1 / n > 0.5 ? 1 : 0;
      const x0 = 200 + Math.cos(a0) * 190;
      const y0 = 200 + Math.sin(a0) * 190;
      const x1 = 200 + Math.cos(a1) * 190;
      const y1 = 200 + Math.sin(a1) * 190;
      const ix0 = 200 + Math.cos(a0) * 118;
      const iy0 = 200 + Math.sin(a0) * 118;
      const ix1 = 200 + Math.cos(a1) * 118;
      const iy1 = 200 + Math.sin(a1) * 118;
      const d = [
        `M ${x0} ${y0}`,
        `A 190 190 0 ${large} 1 ${x1} ${y1}`,
        `L ${ix1} ${iy1}`,
        `A 118 118 0 ${large} 0 ${ix0} ${iy0}`,
        'Z',
      ].join(' ');
      const mid = (i + 0.5) / n * Math.PI * 2 - Math.PI / 2;
      const tx = 200 + Math.cos(mid) * 154;
      const ty = 200 + Math.sin(mid) * 154;
      const rot = ((i + 0.5) / n) * 360;
      const fitted = this._fitLabel(p.nombre, chord, band);
      clips.push(`<clipPath id="vw-seg-${i}"><path d="${d}"/></clipPath>`);
      const out = !!p.agotado && p.id !== winnerId;
      const fill = out ? '#6a6274' : (p.color || colors[i % colors.length]);
      const text = out ? '#ddd6e2' : this._ink(fill);
      const opacity = out ? '0.92' : '0.95';
      paths.push(
        `<path class="seg${out ? ' is-out' : ''}" data-id="${this._xml(p.id)}" d="${d}" fill="${fill}" stroke="${out ? '#3a3442' : '#241225'}" stroke-width="2" opacity="${opacity}"/>`
      );
      const lineH = fitted.size * 1.08;
      const tspans = fitted.lines
        .map(
          (line, li) =>
            `<tspan x="${tx}" dy="${li === 0 ? (-(fitted.lines.length - 1) * lineH) / 2 : lineH}">${this._xml(line)}</tspan>`
        )
        .join('');
      labels.push(
        `<g clip-path="url(#vw-seg-${i})"><text data-id="${this._xml(p.id)}" x="${tx}" y="${ty}" fill="${text}" font-size="${fitted.size}" font-family="Georgia, serif" font-style="italic"
          text-anchor="middle" dominant-baseline="middle" opacity="${out ? '0.8' : '1'}"
          transform="rotate(${rot}, ${tx}, ${ty})">${tspans}</text></g>`
      );
    });

    host.innerHTML = `
      <svg class="vinyl-svg" viewBox="0 0 400 400" id="ruleta-svg">
        ${this._vinylDefs('vw')}
        <defs>${clips.join('')}</defs>
        <g id="ring-rot">
          ${paths.join('')}
          ${this._prizeTexture('vw')}
          ${labels.join('')}
          ${this._vinylDisc('vw')}
        </g>
        ${this._prizeShine('vw')}
        ${this._vinylShine('vw')}
        ${this._vinylLabel()}
      </svg>
    `;

    // Compute target rotation so winner lands at 12 o'clock (pointer)
    // Segments: index i centered at angle (i+0.5)/n * 360, with 0 at top (-90deg in SVG)
    // We rotate the ring counterclockwise (negative in CSS? GSAP positive = clockwise)
    // Spec: antihorario. In SVG/CSS, negative rotation is CCW.
    const winnerIdx = Math.max(
      0,
      shown.findIndex((p) => p.id === winnerId)
    );
    const segAngle = 360 / n;
    // Center of winner segment in unrotated ring: winnerIdx * segAngle + segAngle/2, measured clockwise from top
    const winnerCenterFromTop = winnerIdx * segAngle + segAngle / 2;
    // To bring winnerCenter to top (0), rotate CCW by winnerCenterFromTop → negative angle
    // Extra full spins for drama
    const extraSpins = opts.spins || 4;
    const dir = opts.direction === 1 ? 1 : -1;
    const travel = dir < 0 ? winnerCenterFromTop : (360 - (winnerCenterFromTop % 360)) % 360;
    const finalAngle = dir * (extraSpins * 360 + travel);

    return { finalAngle, winnerIdx, n };
  },

  async spin(host, prizes, winnerId, onDone, opts = {}) {
    const duration = opts.duration || 6.2;
    const meta = this.mountWheel(host, prizes, winnerId, opts);
    const ring = host.querySelector('#ring-rot');
    const lights = host.querySelectorAll('#vw-light, #vw-prize-light');
    const wrap = host.closest('.ruleta-wheel-wrap');
    gsap.set(ring, { rotation: 0, transformOrigin: '200px 200px', svgOrigin: '200 200' });
    lights.forEach((light) => {
      gsap.killTweensOf(light);
      gsap.set(light, { rotation: -16, svgOrigin: '200 200' });
      gsap.to(light, { rotation: 28, duration, ease: 'sine.inOut', svgOrigin: '200 200' });
    });
    if (wrap) {
      gsap.killTweensOf(wrap);
      const zoom = opts.zoom || 'in';
      gsap.set(wrap, { transformOrigin: '50% 4%' });
      if (zoom === 'out') {
        gsap.to(wrap, { scale: 1, duration: 1.5, delay: 0.2, ease: 'power2.inOut' });
      } else if (zoom === 'hold') {
        gsap.set(wrap, { scale: 2.15 });
      } else {
        gsap.set(wrap, { scale: 1 });
        gsap.to(wrap, { scale: 2.15, duration: 1.45, delay: 0.55, ease: 'power2.inOut' });
      }
    }

    await new Promise((resolve) => {
      gsap.to(ring, {
        rotation: meta.finalAngle,
        duration,
        ease: 'power3.out',
        onComplete: resolve,
        svgOrigin: '200 200',
      });
    });

    const marked = [host.querySelector(`.seg[data-id="${CSS.escape(String(winnerId))}"]`)].filter(Boolean);
    marked.forEach((path) => {
      gsap.to(path, {
        attr: { stroke: '#FFC354', 'stroke-width': 4 },
        filter: 'url(#glow)',
        duration: 0.35,
      });
      path.setAttribute('opacity', '1');
      gsap.fromTo(
        path,
        { opacity: 0.7 },
        { opacity: 1, duration: 0.4, yoyo: true, repeat: 3 }
      );
    });
    if (onDone) onDone();
  },

  _ink(hex) {
    const h = String(hex || '').replace('#', '');
    if (h.length < 6) return '#fff';
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return '#fff';
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#241225' : '#fff';
  },

  _splitWords(words, lineCount) {
    const n = Math.min(lineCount, words.length);
    const lines = [];
    let index = 0;
    for (let i = 0; i < n; i += 1) {
      const slots = n - i;
      const rest = words.length - index;
      let take = rest;
      if (slots > 1) {
        const budget = words.slice(index).join(' ').length / slots;
        let length = 0;
        take = 0;
        while (take < rest - (slots - 1)) {
          const next = words[index + take];
          const nextLen = length + (take ? 1 : 0) + next.length;
          if (take > 0 && nextLen > budget) break;
          length = nextLen;
          take += 1;
        }
      }
      lines.push(words.slice(index, index + take).join(' '));
      index += take;
    }
    return lines.filter(Boolean);
  },

  _fitLabel(nombre, maxWidth, maxHeight) {
    const words = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return { size: 11, lines: [''] };
    const widthOf = (text, size) => Math.max(text.length, 1) * size * 0.84;
    const heightOf = (count, size) => count * size * 1.18;
    const limitH = maxHeight || 46;
    for (let size = 12; size >= 5.5; size -= 0.5) {
      if (widthOf(words.join(' '), size) <= maxWidth && heightOf(1, size) <= limitH) {
        return { size, lines: [words.join(' ')] };
      }
      const maxLines = Math.min(3, words.length);
      for (let count = 2; count <= maxLines; count += 1) {
        if (heightOf(count, size) > limitH) continue;
        const chunks = this._splitWords(words, count);
        if (chunks.every((line) => widthOf(line, size) <= maxWidth)) return { size, lines: chunks };
      }
    }
    return { size: 5.5, lines: this._splitWords(words, Math.min(3, words.length)) };
  },

  _xml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  /**
   * La ruleta es la presentación: el premio ya está elegido.
   * Con muchos registros, muestra hasta 12 segmentos legibles e incluye siempre al ganador.
   */
  _shownPrizes(prizes, winnerId) {
    const MAX = 16;
    const list = Array.isArray(prizes) ? prizes : [];
    const live = list.filter((p) => p.pinned || p.id === winnerId || !p.agotado);
    const gray = list.filter((p) => !live.includes(p));
    if (live.length >= MAX) return live;
    return [...live, ...gray.slice(0, MAX - live.length)];
  },

  _norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  },

  _vinylSvg() {
    return `<svg class="vinyl-svg" viewBox="0 0 400 400"><g class="vinyl-disk">${this._vinylInner('vs')}</g></svg>`;
  },

  _vinylInner(id) {
    return `${this._vinylDefs(id)}${this._vinylDisc(id)}${this._vinylShine(id)}${this._vinylLabel()}`;
  },

  _vinylDefs(id) {
    return `
      <defs>
        <radialGradient id="${id}-sheen" cx="30%" cy="20%" r="60%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.85"/>
          <stop offset="28%" stop-color="#ffe7ff" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <clipPath id="${id}-clip">
          <circle cx="200" cy="200" r="110"/>
        </clipPath>
        <mask id="${id}-shine-mask">
          <rect x="0" y="0" width="400" height="400" fill="#000"/>
          <circle cx="200" cy="200" r="110" fill="#fff"/>
          <circle cx="200" cy="200" r="54" fill="#000"/>
        </mask>
        <mask id="${id}-prize-mask">
          <rect x="0" y="0" width="400" height="400" fill="#000"/>
          <circle cx="200" cy="200" r="189" fill="#fff"/>
          <circle cx="200" cy="200" r="121" fill="#000"/>
        </mask>
      </defs>`;
  },

  _prizeTexture(id) {
    const grooves = [];
    for (let r = 124; r <= 186; r += 1.05) {
      const i = Math.round((r - 124) / 1.05);
      const light = i % 2 === 0;
      grooves.push(
        `<circle cx="200" cy="200" r="${r.toFixed(2)}" fill="none" stroke="${light ? '#ffffff' : '#1a1020'}" stroke-width="0.5" opacity="${light ? 0.34 : 0.28}"/>`
      );
    }
    const flashes = [];
    const flashColors = ['#ffffff', '#ffd0f0', '#fff4c8', '#c8f6ff'];
    for (let i = 0; i < 10; i += 1) {
      const r = 128 + i * 5.6;
      flashes.push(
        `<circle cx="200" cy="200" r="${r.toFixed(1)}" fill="none" stroke="${flashColors[i % 4]}" stroke-width="1.35" stroke-linecap="round" stroke-dasharray="${34 + (i % 3) * 18} 280" opacity="0.55" transform="rotate(${(i * 41) % 360} 200 200)"/>`
      );
    }
    const specks = [];
    const speckColors = ['#ffffff', '#ffd0f2', '#d4f7ff', '#ffe7a8'];
    for (let i = 0; i < 56; i += 1) {
      const ang = i * 137.508 * (Math.PI / 180);
      const rad = 126 + ((i * 23) % 58);
      const x = (200 + Math.cos(ang) * rad).toFixed(1);
      const y = (200 + Math.sin(ang) * rad).toFixed(1);
      specks.push(
        `<circle cx="${x}" cy="${y}" r="${(0.55 + (i % 3) * 0.3).toFixed(2)}" fill="${speckColors[i % 4]}" opacity="0.75"/>`
      );
    }
    return `
      <g mask="url(#${id}-prize-mask)" style="mix-blend-mode:soft-light">
        ${grooves.join('')}
        ${flashes.join('')}
        ${specks.join('')}
      </g>`;
  },

  _prizeShine(id) {
    return `
      <g mask="url(#${id}-prize-mask)">
        <g id="${id}-prize-light">
          <ellipse cx="168" cy="92" rx="120" ry="28" fill="#ffffff" opacity="0.2" transform="rotate(-8 168 92)"/>
          <ellipse cx="250" cy="150" rx="90" ry="16" fill="#ff7ad9" opacity="0.16" transform="rotate(16 250 150)"/>
          <ellipse cx="150" cy="250" rx="100" ry="14" fill="#7ee7ff" opacity="0.14" transform="rotate(-14 150 250)"/>
          <ellipse cx="230" cy="300" rx="86" ry="14" fill="#ffc354" opacity="0.16" transform="rotate(6 230 300)"/>
        </g>
      </g>`;
  },

  _vinylDisc(id) {
    const grooves = [];
    for (let r = 107.2; r >= 51.6; r -= 0.72) {
      const i = Math.round((107.2 - r) / 0.72);
      const tone = i % 2 === 0 ? '#8a8a98' : '#2e2e36';
      grooves.push(
        `<circle cx="200" cy="200" r="${r.toFixed(2)}" fill="none" stroke="${tone}" stroke-width="0.42" opacity="${i % 2 === 0 ? 0.8 : 0.95}"/>`
      );
    }
    const flashes = [];
    const flashColors = ['#ffffff', '#ffb3e6', '#fff1b8', '#b9f4ff'];
    for (let i = 0; i < 8; i += 1) {
      const r = 57 + i * 6.4;
      flashes.push(
        `<circle cx="200" cy="200" r="${r.toFixed(1)}" fill="none" stroke="${flashColors[i % 4]}" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="${26 + (i % 3) * 16} 230" opacity="0.5" transform="rotate(${(i * 47) % 360} 200 200)"/>`
      );
    }
    const specks = [];
    const speckColors = ['#ffffff', '#ffc4ee', '#c9f6ff', '#ffe7a8'];
    for (let i = 0; i < 48; i += 1) {
      const ang = i * 137.508 * (Math.PI / 180);
      const rad = 56 + ((i * 19) % 50);
      const x = (200 + Math.cos(ang) * rad).toFixed(1);
      const y = (200 + Math.sin(ang) * rad).toFixed(1);
      specks.push(
        `<circle cx="${x}" cy="${y}" r="${(0.5 + (i % 3) * 0.28).toFixed(2)}" fill="${speckColors[i % 4]}" opacity="0.7"/>`
      );
    }
    return `
      <circle cx="200" cy="200" r="115" fill="none" stroke="#f6f1e8" stroke-width="8"/>
      <circle cx="200" cy="200" r="110.4" fill="none" stroke="#d9d0c4" stroke-width="1"/>
      <g clip-path="url(#${id}-clip)">
        <circle cx="200" cy="200" r="110" fill="#121216"/>
        ${grooves.join('')}
        ${flashes.join('')}
        ${specks.join('')}
      </g>`;
  },

  _vinylShine(id) {
    return `
      <g mask="url(#${id}-shine-mask)">
        <g id="${id}-light">
          <ellipse cx="156" cy="138" rx="96" ry="32" fill="url(#${id}-sheen)" opacity="0.8" transform="rotate(-32 156 138)"/>
          <ellipse cx="214" cy="168" rx="78" ry="14" fill="#ff7ad9" opacity="0.34" transform="rotate(-18 214 168)"/>
          <ellipse cx="188" cy="214" rx="84" ry="11" fill="#7ee7ff" opacity="0.28" transform="rotate(8 188 214)"/>
          <ellipse cx="230" cy="246" rx="64" ry="10" fill="#ffc354" opacity="0.32" transform="rotate(-12 230 246)"/>
          <ellipse cx="250" cy="272" rx="52" ry="10" fill="#ffffff" opacity="0.22" transform="rotate(-22 250 272)"/>
        </g>
      </g>`;
  },

  _vinylLabel() {
    return `
      <g id="vinyl-label">
        <circle cx="200" cy="200" r="50.5" fill="#101014"/>
        <circle cx="200" cy="200" r="48" fill="#F47D20"/>
        <path d="M152.2 196 A48 48 0 0 1 247.8 196 L200 200 Z" fill="#FFC354" opacity="0.85"/>
        <circle cx="200" cy="200" r="46.2" fill="none" stroke="#fff3d2" stroke-width="0.8" opacity="0.55"/>
        <text x="200" y="193" text-anchor="middle" fill="#241225" font-size="13" font-family="Impact, sans-serif">DISCO</text>
        <text x="200" y="210" text-anchor="middle" fill="#481D40" font-size="12" font-family="Georgia, serif" font-style="italic">70's</text>
        <circle cx="200" cy="200" r="5.5" fill="#241225"/>
        <circle cx="200" cy="200" r="2" fill="#6b5344"/>
      </g>`;
  },
};

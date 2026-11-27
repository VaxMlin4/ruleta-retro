/* global */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SlotAnim = api;
})(typeof window !== 'undefined' ? window : this, function () {
  function hashString(value) {
    const str = String(value || 'ruleta');
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function rng() {
      t += 0x6d2b79f5;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function splitName(nombre) {
    return String(nombre || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function shuffle(list, rng) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const swap = copy[i];
      copy[i] = copy[j];
      copy[j] = swap;
    }
    return copy;
  }

  function buildReel(employees, winner, seed) {
    const winnerId = String(winner && winner.id != null ? winner.id : '');
    const winnerWords = splitName(winner && winner.nombre).map((word) => ({
      word,
      employeeId: winnerId,
      spent: false,
    }));
    const pool = [];
    (employees || []).forEach((emp) => {
      const id = String(emp.id);
      if (id === winnerId) return;
      const spent = Number(emp.atenuado) === 1 || emp.atenuado === true;
      splitName(emp.nombre).forEach((word) => {
        pool.push({ word, employeeId: id, spent });
      });
    });
    const rng = mulberry32(hashString(seed || winnerId || 'nombres'));
    const spin = [];
    const source = pool.length ? pool : winnerWords;
    while (source.length && spin.length < 42) {
      spin.push(...shuffle(source, rng));
    }
    const reveal = winnerWords.length ? winnerWords : [{ word: '—', employeeId: winnerId, spent: false }];
    for (let k = reveal.length; k >= 1; k -= 1) {
      const tail = spin.slice(spin.length - k);
      const same = tail.length === k && tail.every((item, i) => item.word === reveal[i].word && item.employeeId === reveal[i].employeeId);
      if (same) {
        spin.splice(spin.length - k, k);
        break;
      }
    }
    while (spin.length < 28 && source.length) spin.push(...shuffle(source, rng));
    const reel = spin.concat(reveal.map((item) => ({ word: item.word, employeeId: item.employeeId, spent: false })));
    const columns = buildColumns(employees, winnerId, reveal, seed || winnerId || 'nombres');
    return {
      reel,
      stopIndex: reel.length - 1,
      firstWinner: reel.length - reveal.length,
      winnerWords: reveal.map((item) => item.word),
      columns: columns.strips,
      prefixLength: columns.prefixLength,
    };
  }

  function slotsFor(words, width) {
    const clean = (words || []).filter(Boolean);
    if (width <= 1) return [clean.join(' ')];
    if (clean.length <= width) {
      const slots = clean.slice();
      while (slots.length < width) slots.push('');
      return slots;
    }
    const slots = clean.slice(0, width - 1);
    slots.push(clean.slice(width - 1).join(' '));
    return slots;
  }

  function buildColumns(employees, winnerId, reveal, seed) {
    const winnerWords = reveal.map((item) => item.word);
    const width = Math.max(1, winnerWords.length);
    const roster = [];
    (employees || []).forEach((emp) => {
      const id = String(emp.id);
      if (id === winnerId) return;
      roster.push({
        id,
        spent: Number(emp.atenuado) === 1 || emp.atenuado === true,
        slots: slotsFor(splitName(emp.nombre), width),
      });
    });
    if (!roster.length) {
      roster.push({
        id: winnerId,
        spent: false,
        slots: slotsFor(winnerWords, width),
      });
    }
    const rng = mulberry32(hashString(`${seed}:lineas`));
    const prefix = [];
    while (prefix.length < 20) prefix.push(...shuffle(roster, rng));
    prefix.length = 20;
    const easeMs = 700;
    const holdMs = 280;
    const travel = 17;
    const speed = (0.88 * travel) / (0.72 * 2.1);
    const winner = { id: winnerId, spent: false, slots: slotsFor(winnerWords, width) };
    const strips = [];
    for (let c = 0; c < width; c += 1) {
      const cruiseFor = (c * (easeMs + holdMs)) / 1000;
      const extraCount = Math.ceil(speed * cruiseFor + 4);
      const extras = [];
      while (extras.length < extraCount) extras.push(...shuffle(roster, rng));
      extras.length = extraCount;
      const rows = prefix.concat(extras, [winner]);
      strips.push(rows.map((person) => ({
        word: person.slots[c] || '',
        employeeId: person.id,
        spent: !!person.spent,
      })));
    }
    return { strips, prefixLength: prefix.length };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function scheduleUnify(row) {
    if (row._slotUnify) return;
    row._slotUnify = true;
    queueMicrotask(() => {
      row._slotUnify = false;
      const windows = [...row.querySelectorAll('.slot-window')].filter((host) => host.isConnected && host._slotColumns);
      if (windows.length) unifyWindows(windows);
    });
  }

  function unifyWindows(windows) {
    const holder = document.createElement('div');
    holder.className = 'slot-strip';
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;';
    const probe = document.createElement('div');
    probe.className = 'name';
    probe.style.cssText = 'position:relative;width:max-content;height:auto;line-height:normal;white-space:nowrap;';
    holder.appendChild(probe);
    document.body.appendChild(holder);
    const reference = 2.35;
    function measure(word, rem) {
      probe.style.fontSize = `${rem}rem`;
      probe.textContent = word || '';
      return Math.ceil(probe.getBoundingClientRect().width);
    }
    function winnerOf(host) {
      return (host._slotColumns || []).map((col) => {
        const last = col[col.length - 1];
        return (last && last.word) || '';
      });
    }
    function spaceOf(host) {
      const box = host.querySelector('.slot-reels');
      const style = box ? getComputedStyle(box) : null;
      const gapPx = style ? parseFloat(style.columnGap) || 8 : 8;
      const pad = style ? (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0) : 0;
      return { gapPx, available: Math.max(0, host.clientWidth - pad - 4) };
    }
    function rowWidth(widths, start, end, gapPx) {
      let used = 0;
      for (let i = start; i < end; i += 1) {
        if (!widths[i]) continue;
        used += widths[i] + (used ? gapPx : 0);
      }
      return used;
    }
    function pack(words, rem, available, gapPx) {
      const widths = words.map((word) => (word ? measure(word, rem) : 0));
      const widest = widths.length ? Math.max(...widths) : 0;
      const count = widths.length;
      if (!count || widest > available) return { lines: 99, split: 0, widest };
      if (count === 1 || rowWidth(widths, 0, count, gapPx) <= available) {
        return { lines: 1, split: 0, widest };
      }
      let best = null;
      for (let cut = 1; cut < count; cut += 1) {
        const left = rowWidth(widths, 0, cut, gapPx);
        const right = rowWidth(widths, cut, count, gapPx);
        if (left > available || right > available) continue;
        const balance = Math.abs(cut - (count - cut));
        if (!best || balance < best.balance) best = { lines: 2, split: cut, widest, balance };
      }
      return best || { lines: 99, split: 0, widest };
    }
    let size = reference;
    while (size > 1.45) {
      const fits = windows.every((host) => {
        const room = spaceOf(host);
        if (room.available < 48) return true;
        const laid = pack(winnerOf(host), size, room.available, room.gapPx);
        return laid.lines <= 2;
      });
      if (fits) break;
      size = Math.round((size - 0.06) * 1000) / 1000;
    }
    const label = `${size.toFixed(3)}rem`;
    windows.forEach((host) => {
      host.style.setProperty('--slot-size', label);
      const words = winnerOf(host);
      const room = spaceOf(host);
      const laid = pack(words, size, room.available, room.gapPx);
      const reels = [...host.querySelectorAll('.slot-reel')];
      if (laid.split > 0 && reels[laid.split]) {
        const breakLine = document.createElement('span');
        breakLine.className = 'slot-break';
        reels[laid.split].before(breakLine);
      }
      reels.forEach((reel, index) => {
        const width = Math.max(measure(words[index], size), 8);
        reel.style.flex = '0 0 auto';
        reel.style.width = `${width}px`;
        reel.querySelectorAll('.name').forEach((el) => {
          el.style.transform = '';
          el.style.transformOrigin = 'center center';
          if (el.textContent && el.scrollWidth > width + 1) {
            el.style.transform = `scaleX(${(width / el.scrollWidth).toFixed(3)})`;
          }
        });
      });
    });
    holder.remove();
  }

  function fitReels(host, reelEls, columns) {
    const probe = document.createElement('div');
    probe.className = 'name';
    probe.style.cssText = 'position:absolute;visibility:hidden;width:max-content;height:auto;line-height:normal;overflow:visible;pointer-events:none;';
    host.appendChild(probe);
    const gap = 0.4 * 16;
    function measure(size) {
      probe.style.fontSize = size;
      return columns.map((col) => {
        let max = 0;
        col.forEach((item) => {
          if (!item || !item.word) return;
          probe.textContent = item.word;
          max = Math.max(max, Math.ceil(probe.getBoundingClientRect().width) + 8);
        });
        return Math.max(max, 8);
      });
    }
    function totalOf(widths) {
      return widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1);
    }
    let size = '1.5rem';
    let widths = measure(size);
    let total = totalOf(widths);
    const machine = host.closest ? host.closest('.slot-machine') : null;
    const batched = machine && machine.parentElement && machine.parentElement.classList.contains('slot-row');
    if (machine && !batched) {
      const chrome = Math.max(0, machine.clientWidth - host.clientWidth);
      const maxCard = Math.min(window.innerWidth * 0.94, 1200);
      const card = Math.max(520, Math.min(maxCard, Math.ceil(total + chrome + 16)));
      machine.style.width = `${Math.round(card)}px`;
      machine.style.maxWidth = '94vw';
    }
    let available = Math.max(80, host.clientWidth - 6);
    if (total > available && total > 0) {
      const rem = Math.max(0.72, ((1.5 * available) / total) * 0.98);
      size = `${rem.toFixed(3)}rem`;
      widths = measure(size);
      total = totalOf(widths);
      if (total > available) {
        const rem2 = Math.max(0.62, (parseFloat(size) * available) / total);
        size = `${rem2.toFixed(3)}rem`;
        widths = measure(size);
      }
    }
    host.style.setProperty('--slot-size', size);
    probe.remove();
    reelEls.forEach((reel, index) => {
      reel.style.width = `${widths[index] || 8}px`;
    });
  }

  function run(host, built, opts) {
    const options = opts || {};
    const columns = built.columns && built.columns.length ? built.columns : [built.reel || []];
    const winnerWords = built.winnerWords || [];
    const prefixEnd = Math.max(0, (built.prefixLength || columns[0].length || 1) - 1);
    let alive = true;
    let raf = 0;

    host.innerHTML = '';
    host.style.removeProperty('--slot-words');
    const machine = host.closest ? host.closest('.slot-machine') : null;
    if (machine) machine.style.width = '';
    const wrap = document.createElement('div');
    wrap.className = 'slot-reels';
    const reelEls = [];
    const strips = columns.map((col) => {
      const reel = document.createElement('div');
      reel.className = 'slot-reel';
      const strip = document.createElement('div');
      strip.className = 'slot-strip';
      strip.innerHTML = col
        .map((item) => {
          const gray = item.spent && item.word ? ' is-spent' : '';
          return `<div class="name${gray}">${escapeHtml(item.word || '')}</div>`;
        })
        .join('');
      reel.appendChild(strip);
      wrap.appendChild(reel);
      reelEls.push(reel);
      return strip;
    });
    host.appendChild(wrap);
    host._slotColumns = columns;
    const batched = machine && machine.parentElement && machine.parentElement.classList.contains('slot-row');
    if (batched) scheduleUnify(machine.parentElement);
    else fitReels(host, reelEls, columns);

    const sample = strips[0] && strips[0].querySelector('.name');
    const row = (sample && sample.getBoundingClientRect().height) || 72;
    const stops = columns.map((col) => Math.max(0, col.length - 1));
    const start = Math.min(2, prefixEnd);
    const positions = columns.map(() => start);
    const syncMs = 2100;
    const easeMs = 700;
    const holdMs = 280;
    const travel = Math.max(0, prefixEnd - start);
    const speed = travel > 0 ? (0.88 * travel) / (0.72 * (syncMs / 1000)) : 10;

    function paint() {
      strips.forEach((strip, index) => {
        strip.style.transform = `translateY(${(-positions[index] * row).toFixed(2)}px)`;
      });
    }

    function stop() {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function aborted() {
      return !alive || (options.shouldAbort && options.shouldAbort());
    }

    function cruise(fromColumn, dt) {
      for (let j = fromColumn; j < positions.length; j += 1) {
        const ceiling = stops[j] - 4;
        positions[j] = Math.min(ceiling, positions[j] + speed * dt);
      }
    }

    function syncEased(u) {
      if (u <= 0.28) return 0.12 * Math.pow(u / 0.28, 2);
      return 0.12 + 0.88 * ((u - 0.28) / 0.72);
    }

    function brake(u, slope) {
      const s = Math.max(0.6, Math.min(2.2, slope));
      const c = s - 2;
      const b = 3 - 2 * s;
      return s * u + b * u * u + c * u * u * u;
    }

    function syncAll() {
      const t0 = performance.now();
      return new Promise((resolve) => {
        function frame(now) {
          if (aborted()) {
            stop();
            resolve(false);
            return;
          }
          const u = Math.min(1, (now - t0) / syncMs);
          const pos = start + travel * syncEased(u);
          for (let i = 0; i < positions.length; i += 1) positions[i] = pos;
          paint();
          if (u >= 1) {
            for (let i = 0; i < positions.length; i += 1) positions[i] = prefixEnd;
            paint();
            resolve(true);
            return;
          }
          raf = requestAnimationFrame(frame);
        }
        raf = requestAnimationFrame(frame);
      });
    }

    function easeColumn(index) {
      const from = positions[index];
      const target = stops[index];
      const distance = Math.max(0.001, target - from);
      const slope = (speed * (easeMs / 1000)) / distance;
      const t0 = performance.now();
      let last = t0;
      return new Promise((resolve) => {
        function frame(now) {
          if (aborted()) {
            stop();
            resolve(false);
            return;
          }
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          cruise(index + 1, dt);
          const u = Math.min(1, (now - t0) / easeMs);
          positions[index] = from + distance * brake(u, slope);
          paint();
          if (u >= 1) {
            positions[index] = target;
            paint();
            resolve(true);
            return;
          }
          raf = requestAnimationFrame(frame);
        }
        raf = requestAnimationFrame(frame);
      });
    }

    function holdCruise(ms, fromColumn) {
      const t0 = performance.now();
      let last = t0;
      return new Promise((resolve) => {
        function frame(now) {
          if (aborted()) {
            stop();
            resolve(false);
            return;
          }
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          cruise(fromColumn, dt);
          paint();
          if (now - t0 >= ms) {
            resolve(true);
            return;
          }
          raf = requestAnimationFrame(frame);
        }
        raf = requestAnimationFrame(frame);
      });
    }

    function locked(count) {
      if (options.onLock) options.onLock(winnerWords.slice(0, count));
    }

    const done = (async function play() {
      paint();
      const spun = await syncAll();
      if (!spun) return { aborted: true };
      for (let i = 0; i < columns.length; i += 1) {
        const moved = await easeColumn(i);
        if (!moved) return { aborted: true };
        locked(i + 1);
        if (i < columns.length - 1) {
          const paused = await holdCruise(holdMs, i + 1);
          if (!paused) return { aborted: true };
        }
      }
      const tail = await holdCruise(420, columns.length);
      if (!tail) return { aborted: true };
      return { aborted: false };
    })();

    return {
      done,
      cancel() {
        stop();
      },
    };
  }

  return { splitName, buildReel, run };
});

/* global */
window.DiscoBall = {
  _balls: [],
  _looping: false,

  mount(root) {
    root.querySelectorAll('.disco-ball').forEach((host) => {
      if (host.dataset.sphere === '1') return;
      host.dataset.sphere = '1';
      host.innerHTML = '<canvas class="disco-canvas"></canvas>';
      this._balls.push({
        host,
        canvas: host.querySelector('canvas'),
        angle: Math.random() * 360,
      });
    });
    if (!this._looping) {
      this._looping = true;
      const tick = (t) => {
        this._balls.forEach((ball) => this._draw(ball, t || 0));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  },

  _mix(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  },

  _tone(lat, lon) {
    const silver = [246, 240, 230];
    const gold = [255, 195, 84];
    const cream = [255, 229, 184];
    const orange = [244, 125, 32];
    const magenta = [232, 90, 150];
    const plum = [145, 44, 112];
    const u = 0.5 + 0.5 * Math.sin((lon * 2.4 + lat * 1.1) * Math.PI / 180);
    const v = 0.5 + 0.5 * Math.cos((lon * 1.7 - lat * 1.6) * Math.PI / 180);
    let color = this._mix(silver, cream, u * 0.55);
    color = this._mix(color, gold, Math.pow(u, 1.6) * 0.85);
    color = this._mix(color, magenta, Math.pow(v, 2.2) * 0.8);
    if (u < 0.28 && v > 0.55) color = this._mix(color, orange, 0.55);
    if (u > 0.72 && v < 0.3) color = this._mix(color, plum, 0.45);
    return color;
  },

  _draw(ball, t) {
    if (!ball.host.offsetParent) return;
    const rect = ball.host.getBoundingClientRect();
    const css = Math.max(1, rect.width);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.round(css * dpr);
    const canvas = ball.canvas;
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.44;
    ball.angle = (t * 0.02) % 360;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    const base = ctx.createRadialGradient(cx - R * 0.28, cy - R * 0.32, R * 0.08, cx, cy, R);
    base.addColorStop(0, '#f7f1e6');
    base.addColorStop(0.62, '#c9b496');
    base.addColorStop(1, '#2c1814');
    ctx.fillStyle = base;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    const latStep = 6.5;
    const lonStep = 7.2;
    for (let lat = -78; lat <= 78; lat += latStep) {
      const row = Math.round((lat + 78) / latStep);
      const lonShift = (row % 2) * (lonStep / 2);
      for (let lon = 0; lon < 360; lon += lonStep) {
        const center = this._project(lat, lon + lonShift + ball.angle, cx, cy, R);
        if (center.nz <= 0.05) continue;
        const halfLat = latStep * 0.4;
        const halfLon = lonStep * 0.4;
        const corners = [
          this._project(lat - halfLat, lon - halfLon + lonShift + ball.angle, cx, cy, R),
          this._project(lat - halfLat, lon + halfLon + lonShift + ball.angle, cx, cy, R),
          this._project(lat + halfLat, lon + halfLon + lonShift + ball.angle, cx, cy, R),
          this._project(lat + halfLat, lon - halfLon + lonShift + ball.angle, cx, cy, R),
        ];
        const light = Math.max(0, center.nx * -0.28 + center.ny * 0.42 + center.nz * 0.86);
        const spec = Math.pow(Math.max(0, center.nx * -0.15 + center.ny * 0.38 + center.nz * 0.92), 28);
        const tone = this._tone(lat, lon + ball.angle * 0.35);
        const shade = 0.16 + light * 0.9;
        const r = Math.min(255, tone[0] * shade + spec * 210);
        const g = Math.min(255, tone[1] * shade + spec * 170);
        const b = Math.min(255, tone[2] * shade + spec * 110);
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[1].x, corners[1].y);
        ctx.lineTo(corners[2].x, corners[2].y);
        ctx.lineTo(corners[3].x, corners[3].y);
        ctx.closePath();
        ctx.fill();
      }
    }

    const glow = ctx.createRadialGradient(cx - R * 0.28, cy - R * 0.32, R * 0.02, cx, cy, R);
    glow.addColorStop(0, 'rgba(255, 248, 226, 0.55)');
    glow.addColorStop(0.18, 'rgba(255, 248, 226, 0)');
    glow.addColorStop(0.72, 'rgba(20, 8, 16, 0)');
    glow.addColorStop(1, 'rgba(16, 6, 12, 0.45)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const sparks = ['#fff8e6', '#ffc354', '#f4c2d8', '#fff8e6', '#ffc354', '#ffe5b8'];
    sparks.forEach((color, i) => {
      const orbit = t * (0.00045 + i * 0.00008) + i * 1.15;
      const rad = R * (1.08 + 0.16 * Math.sin(t * 0.0011 + i));
      const x = cx + Math.cos(orbit) * rad;
      const y = cy + Math.sin(orbit) * rad * 0.78;
      const twinkle = Math.pow(Math.max(0, Math.sin(t * 0.005 + i * 1.9)), 2);
      this._star(ctx, x, y, size * (0.018 + twinkle * 0.02), color, 0.2 + twinkle * 0.8, orbit);
    });
  },

  _project(latDeg, lonDeg, cx, cy, R) {
    const lat = (latDeg * Math.PI) / 180;
    const lon = (lonDeg * Math.PI) / 180;
    const nx = Math.cos(lat) * Math.sin(lon);
    const ny = Math.sin(lat);
    const nz = Math.cos(lat) * Math.cos(lon);
    const tilt = (20 * Math.PI) / 180;
    const ny2 = ny * Math.cos(tilt) - nz * Math.sin(tilt);
    const nz2 = ny * Math.sin(tilt) + nz * Math.cos(tilt);
    return { x: cx + nx * R, y: cy - ny2 * R, nx, ny: ny2, nz: nz2 };
  },

  _star(ctx, x, y, r, color, alpha, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    x = 0;
    y = 0;
    ctx.lineTo(x + r * 0.22, y - r * 0.22);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x + r * 0.22, y + r * 0.22);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.22, y + r * 0.22);
    ctx.lineTo(x - r, y);
    ctx.lineTo(x - r * 0.22, y - r * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
};

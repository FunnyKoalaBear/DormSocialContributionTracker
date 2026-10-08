/*
 * Dorm Points: the bouncing bubble leaderboard.
 * Every point total gets its own band of sky (more points = higher band).
 * Bubbles float up from the hills, drift sideways, bob, and bounce off
 * each other and the walls.
 */
(function () {
  'use strict';

  // [fill, highlight, shade]
  const BAND_COLORS = [
    ['#ff7b7b', '#ffc4c4', '#e05252'],
    ['#84dc5e', '#cdf5b8', '#52b33a'],
    ['#ffa3d3', '#ffd9ee', '#e06aa8'],
    ['#b9a1ff', '#e3daff', '#8d6ee8'],
    ['#6ecbff', '#c9eeff', '#3a9fe0'],
    ['#55e0c8', '#c2f7ee', '#21b39b'],
    ['#ffb84d', '#ffe2ad', '#e38c17'],
  ];
  const MEDAL_COLORS = {
    1: ['#ffd23f', '#fff3b8', '#e2a400'],
    2: ['#e3e9f1', '#ffffff', '#a8b5c6'],
    3: ['#f5ab62', '#ffdcb8', '#cc7b31'],
  };
  const ZERO_COLORS = ['#fff6e0', '#ffffff', '#e6d6b3'];
  const NEGATIVE_COLORS = ['#bcc4d2', '#e6eaf0', '#8893a6'];
  const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  const CJK_RE = /[぀-ヿ㐀-鿿가-힯]/;
  const measurer = document.createElement('canvas').getContext('2d');

  /** Text width in em for the bubble font. */
  function emWidth(text, weight) {
    measurer.font = `${weight} 100px Nunito, system-ui, -apple-system, "Segoe UI", sans-serif`;
    return measurer.measureText(text).width / 100;
  }

  /** Two-line version of a long name, or null when it can't be split nicely. */
  function splitName(name) {
    if (name.length <= 5) return null;
    const words = name.split(/\s+/);
    if (words.length > 1) {
      let best = null;
      let bestLen = Infinity;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' ');
        const z = words.slice(i).join(' ');
        if (Math.max(a.length, z.length) < bestLen) { best = [a, z]; bestLen = Math.max(a.length, z.length); }
      }
      return best;
    }
    if (CJK_RE.test(name) || name.length < 8) return null;
    const hyphen = name.indexOf('-', 2);
    if (hyphen > 0 && hyphen < name.length - 2) return [name.slice(0, hyphen + 1), name.slice(hyphen + 1)];
    // One long word: hyphenate before a consonant+vowel pair near the middle ("Mukham-madyusuf").
    const vowel = c => /[aeiouyàáâäãåèéêëìíîïòóôöõùúûüāēīōū]/i.test(c);
    let cut = Math.ceil(name.length / 2);
    let bestDist = Infinity;
    for (let i = 3; i <= name.length - 3; i++) {
      if (!vowel(name[i]) && vowel(name[i + 1]) && /\p{L}/u.test(name[i]) && Math.abs(i - name.length / 2) < bestDist) {
        bestDist = Math.abs(i - name.length / 2);
        cut = i;
      }
    }
    return [name.slice(0, cut) + '-', name.slice(cut)];
  }

  class BubbleArena {
    constructor(root, options) {
      this.root = root;
      this.layer = root.querySelector('.arena-bubbles');
      this.levelLayer = root.querySelector('.arena-levels');
      this.onSelect = (options && options.onSelect) || function () {};
      this.bubbles = [];
      this.selected = null;
      this.meId = null;
      this.time = 0;
      this.width = 0;
      this.running = false;
      this.visible = true;
      this.motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.loop = this.loop.bind(this);

      this.layer.addEventListener('click', e => {
        const el = e.target.closest('.bubble');
        if (!el) return;
        const b = this.bubbles.find(x => x.el === el);
        this.select(b && b !== this.selected ? b.s.id : null);
      });
      if ('ResizeObserver' in window) new ResizeObserver(() => this.layout(false)).observe(root);
      else window.addEventListener('resize', () => this.layout(false));
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
          this.visible = entries[entries.length - 1].isIntersecting;
          this.wake();
        }).observe(root);
      }
      document.addEventListener('visibilitychange', () => this.wake());
      if (document.fonts && document.fonts.load) {
        Promise.all(['900 16px Nunito', '800 16px Nunito'].map(f => document.fonts.load(f)))
          .then(() => this.restyle())
          .catch(() => {});
      }
    }

    /** `students` must be ranked (see DormCore.rankStudents). */
    setStudents(students) {
      this.layer.textContent = '';
      this.selected = null;
      const n = students.length;
      this.bubbles = students.map((s, i) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'bubble';
        el.dataset.id = s.id;
        el.setAttribute('aria-label', `${s.name}, ${s.id}: ${s.points} points, rank ${s.rank}`);
        el.innerHTML =
          '<span class="bubble-face">' +
          `<span class="bubble-name">${escapeHtml(s.name)}</span>` +
          `<span class="bubble-id">${escapeHtml(s.id)}</span>` +
          '</span>' +
          (MEDALS[s.rank] && s.points > 0 ? `<span class="bubble-medal" aria-hidden="true">${MEDALS[s.rank]}</span>` : '') +
          '<span class="bubble-you" aria-hidden="true">YOU</span>';
        this.layer.appendChild(el);
        return {
          s, el,
          face: el.firstChild,
          x: 0, y: 0, vx: 0, vy: 0, r: 20,
          home: 0, yMin: 0, yMax: 0,
          dir: Math.random() < 0.5 ? -1 : 1,
          speed: rand(0.75, 1.25),
          phase: rand(0, Math.PI * 2),
          bob: rand(1.1, 1.9),
          // lowest scores float up first, the leaders last
          delay: this.motion ? 0.15 + ((n - 1 - i) / Math.max(1, n)) * 1.2 + rand(0, 0.15) : 0,
          arrived: !this.motion,
          lastWobble: 0,
        };
      });
      if (this.meId) this.setMe(this.meId);
      this.time = 0;
      this.layout(true);
      this.wake();
    }

    setMe(id) {
      this.meId = id || null;
      for (const b of this.bubbles) b.el.classList.toggle('is-me', b.s.id === this.meId);
    }

    // ------------------------------------------------------------ layout

    layout(initial) {
      const W = this.root.clientWidth;
      if (!this.bubbles.length || !W || (!initial && W === this.width)) return;
      const oldW = this.width;
      this.width = W;

      const small = W < 560;
      const gutter = small ? 46 : 62; // room for the point labels on the left
      const left = gutter;
      const right = W - (small ? 6 : 12);
      const innerW = right - left;
      const base = small ? 56 : W < 900 ? 62 : 70;
      const points = this.bubbles.map(b => b.s.points);
      const maxP = Math.max.apply(null, points);
      const minP = Math.min.apply(null, points);
      const norm = p => (maxP === minP ? 0.5 : (p - minP) / (maxP - minP));

      for (const b of this.bubbles) {
        b.r = (base * (0.94 + 0.36 * norm(b.s.points))) / 2;
        this.styleBubble(b);
      }

      // One band per point total, highest first.
      const groups = new Map();
      for (const b of this.bubbles) {
        if (!groups.has(b.s.points)) groups.set(b.s.points, []);
        groups.get(b.s.points).push(b);
      }
      let colorIndex = 0;
      const levels = Array.from(groups.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([pts, list]) => {
          const dmax = Math.max.apply(null, list.map(b => b.r * 2));
          const need = list.reduce((sum, b) => sum + b.r * 2 * 1.2, 0);
          const rows = Math.max(1, Math.ceil(need / innerW));
          // Medal bands are gold/silver/bronze; the rest take turns through the palette.
          const color = pts > 0 && list[0].s.rank > 3 ? colorIndex++ : 0;
          return { points: pts, list, rows, colorIndex: color, dmax, h: rows * dmax * 1.07 + 14 };
        });

      const top = 16;
      const ground = small ? 54 : 66;
      const gap = 10;
      const bandsH = levels.reduce((sum, l) => sum + l.h, 0);
      const required = bandsH + gap * (levels.length - 1) + top + ground;
      const preferred = Math.round(Math.min(Math.max(window.innerHeight * 0.68, 460), 720));
      const cap = Math.max(preferred, 2400);
      const H = Math.max(preferred, Math.min(required, cap));
      if (required > cap) {
        const scale = (cap - top - ground - gap * (levels.length - 1)) / bandsH;
        levels.forEach(l => { l.h *= scale; });
      }
      const yTop = top;
      const yBottom = H - ground;

      // Aim for a straight "points -> height" scale, then nudge bands apart so they never overlap.
      levels.forEach(l => {
        const lo = yTop + l.h / 2;
        const hi = yBottom - l.h / 2;
        l.cy = lo + (1 - norm(l.points)) * (hi - lo);
      });
      for (let i = 1; i < levels.length; i++) {
        const a = levels[i - 1], b = levels[i];
        b.cy = Math.max(b.cy, a.cy + a.h / 2 + gap + b.h / 2);
      }
      const lastLevel = levels[levels.length - 1];
      lastLevel.cy = Math.min(lastLevel.cy, yBottom - lastLevel.h / 2);
      for (let i = levels.length - 2; i >= 0; i--) {
        const a = levels[i], b = levels[i + 1];
        a.cy = Math.min(a.cy, b.cy - b.h / 2 - gap - a.h / 2);
      }

      this.root.style.height = H + 'px';
      this.root.style.setProperty('--gutter', gutter + 'px');
      this.bounds = { left, right, H };

      // Bubbles get a "home" row inside their band.
      for (const l of levels) {
        const bandTop = l.cy - l.h / 2;
        const rowH = (l.h - 14) / l.rows;
        const rows = Array.from({ length: l.rows }, () => []);
        l.list.forEach((b, i) => rows[i % l.rows].push(b));
        rows.forEach((row, k) => {
          row.forEach((b, j) => {
            b.level = l;
            b.home = bandTop + 7 + rowH * (k + 0.5);
            b.yMin = bandTop + b.r;
            b.yMax = bandTop + l.h - b.r;
            if (b.yMin > b.yMax) b.yMin = b.yMax = l.cy;
            if (initial) {
              b.x = left + ((j + 0.5) * innerW) / row.length + rand(-6, 6);
              b.y = this.motion ? H + b.r + rand(0, 60) : b.home;
              b.vx = this.motion ? b.dir * 20 : 0;
              b.vy = 0;
            } else {
              if (oldW) b.x = left + ((b.x - left) * innerW) / Math.max(1, oldW - left - (oldW < 560 ? 6 : 12));
              if (b.arrived) b.y = Math.min(b.yMax, Math.max(b.yMin, b.y));
            }
            this.colorBubble(b);
          });
        });
      }
      this.renderLevels(levels);
      if (!this.motion) this.settle();
      this.render(0);
      if (this.selected) this.onSelect(this.selected.s, this.positionOf(this.selected));
    }

    /** Sizes the name to fit its bubble, going to two lines when that reads bigger. */
    styleBubble(b) {
      const d = b.r * 2;
      const inner = d - 6; // minus the outline
      const name = b.s.name;
      let lines = [name];
      let fs = Math.min(d * 0.25, (inner * 0.84) / emWidth(name, 900));
      const split = fs < 10.5 && splitName(name);
      if (split) {
        const fs2 = Math.min(d * 0.22, (inner * 0.76) / Math.max(emWidth(split[0], 900), emWidth(split[1], 900)));
        if (fs2 > fs) { lines = split; fs = fs2; }
      }
      const words = name.split(/\s+/);
      if (fs < 9.5 && words.length >= 3) {
        const three = [words[0], words[1], words.slice(2).join(' ')];
        const fs3 = Math.min(d * 0.19, (inner * 0.7) / Math.max.apply(null, three.map(w => emWidth(w, 900))));
        if (fs3 > fs) { lines = three; fs = fs3; }
      }
      const fid = Math.min(d * 0.15, (inner * 0.8) / emWidth(b.s.id, 800));
      b.el.style.setProperty('--d', d.toFixed(1) + 'px');
      b.el.style.setProperty('--fs', Math.max(7.5, fs).toFixed(1) + 'px');
      b.el.style.setProperty('--fid', Math.max(7, fid).toFixed(1) + 'px');
      b.face.firstChild.innerHTML = lines.map(escapeHtml).join('<br>');
    }

    /** Re-fit names once the web font has loaded (it's wider than the fallback). */
    restyle() {
      for (const b of this.bubbles) this.styleBubble(b);
    }

    colorBubble(b) {
      const s = b.s;
      const c = s.points < 0 ? NEGATIVE_COLORS
        : s.points === 0 ? ZERO_COLORS
        : MEDAL_COLORS[s.rank] || BAND_COLORS[b.level.colorIndex % BAND_COLORS.length];
      b.face.style.setProperty('--c', c[0]);
      b.face.style.setProperty('--cl', c[1]);
      b.face.style.setProperty('--cd', c[2]);
    }

    renderLevels(levels) {
      this.levelLayer.textContent = '';
      for (const l of levels) {
        const line = document.createElement('div');
        line.className = 'level-line';
        line.style.top = l.cy.toFixed(1) + 'px';
        const tag = document.createElement('div');
        tag.className = 'level-tag';
        tag.style.top = l.cy.toFixed(1) + 'px';
        const label = (l.points < 0 ? '−' : '') + Math.abs(l.points);
        tag.innerHTML = `<b>${label}</b><small>${Math.abs(l.points) === 1 ? 'pt' : 'pts'}</small>`;
        this.levelLayer.append(line, tag);
      }
    }

    // ------------------------------------------------------------ selection

    select(id, opts) {
      const b = id ? this.bubbles.find(x => x.s.id === id) : null;
      if (this.selected) this.selected.el.classList.remove('is-selected');
      this.selected = b || null;
      this.root.classList.toggle('has-selection', !!b);
      if (b) {
        b.el.classList.add('is-selected');
        b.vx = 0;
        b.vy = 0;
        if (!b.arrived) { b.arrived = true; b.y = b.home; }
        if (opts && opts.scroll) {
          const rect = this.root.getBoundingClientRect();
          const y = window.scrollY + rect.top + b.y - window.innerHeight * 0.5;
          window.scrollTo({ top: Math.max(0, y), behavior: this.motion ? 'smooth' : 'auto' });
        }
        this.render(0);
      }
      this.onSelect(b ? b.s : null, b ? this.positionOf(b) : null);
      this.wake();
    }

    positionOf(b) {
      return { x: b.x, y: b.y, r: b.r * 1.14, width: this.width, height: this.bounds.H };
    }

    // ------------------------------------------------------------ animation

    wake() {
      if (this.running || !this.visible || document.hidden || !this.bubbles.length) return;
      if (!this.motion) return;
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(this.loop);
    }

    loop(now) {
      if (!this.visible || document.hidden) { this.running = false; return; }
      const dt = Math.min((now - this.last) / 1000, 1 / 30);
      this.last = now;
      this.time += dt;
      this.step(dt);
      this.render(dt);
      requestAnimationFrame(this.loop);
    }

    /** Reduced motion: just untangle the bubbles once, no animation. */
    settle() {
      for (let i = 0; i < 120; i++) { this.collide(false); this.clamp(); }
    }

    step(dt) {
      const t = this.time;
      const cruise = this.width < 560 ? 16 : 24;
      for (const b of this.bubbles) {
        if (b === this.selected) continue;
        if (!b.arrived) {
          if (t < b.delay) continue;
          // Float up, slowing down near home, then pop into place.
          const want = -Math.min(560, 3.4 * (b.y - b.home) + 40);
          b.vy += (want - b.vy) * Math.min(1, 7 * dt);
          b.y += b.vy * dt;
          b.x += b.vx * dt * 0.3;
          if (b.y <= b.home + 1) {
            b.arrived = true;
            b.vy *= 0.35;
            this.wobble(b, 'pop');
          }
          continue;
        }
        b.vx += (b.dir * b.speed * cruise - b.vx) * Math.min(1, 0.9 * dt);
        const room = Math.max(0, Math.min(5, (b.yMax - b.yMin) / 2));
        const target = b.home + Math.sin(t * b.bob + b.phase) * room;
        b.vy += ((target - b.y) * 16 - b.vy * 4.2) * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      this.collide(true);
      this.clamp();
    }

    collide(withVelocity) {
      const list = this.bubbles.filter(b => b.arrived);
      const sel = this.selected;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const min = a.r + b.r + 2;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.01;
          const nx = d2 ? dx / d : 1;
          const ny = d2 ? dy / d : 0;
          const ma = a.r * a.r;
          const mb = b.r * b.r;
          let wa = a === sel ? 0 : mb / (ma + mb);
          let wb = b === sel ? 0 : ma / (ma + mb);
          if (!wa && !wb) continue;
          if (!wa) wb = 1;
          if (!wb) wa = 1;
          const overlap = min - d;
          a.x -= nx * overlap * wa; a.y -= ny * overlap * wa;
          b.x += nx * overlap * wb; b.y += ny * overlap * wb;
          if (!withVelocity) continue;
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv >= 0) continue;
          const impulse = (-(1 + 0.9) * rv) / (1 / ma + 1 / mb);
          if (a !== sel) { a.vx -= (impulse * nx) / ma; a.vy -= (impulse * ny) / ma; }
          if (b !== sel) { b.vx += (impulse * nx) / mb; b.vy += (impulse * ny) / mb; }
          if (Math.abs(a.vx) > 2) a.dir = Math.sign(a.vx);
          if (Math.abs(b.vx) > 2) b.dir = Math.sign(b.vx);
        }
      }
    }

    clamp() {
      const { left, right } = this.bounds;
      for (const b of this.bubbles) {
        if (b.x - b.r < left) {
          b.x = left + b.r;
          if (b.vx < 0) { if (b.vx < -8) this.wobble(b, 'wall'); b.vx = -b.vx; }
          b.dir = 1;
        } else if (b.x + b.r > right) {
          b.x = right - b.r;
          if (b.vx > 0) { if (b.vx > 8) this.wobble(b, 'wall'); b.vx = -b.vx; }
          b.dir = -1;
        }
        if (!b.arrived) continue;
        if (b.y < b.yMin) { b.y = b.yMin; if (b.vy < 0) b.vy *= -0.4; }
        else if (b.y > b.yMax) { b.y = b.yMax; if (b.vy > 0) b.vy *= -0.4; }
      }
    }

    wobble(b, kind) {
      if (!this.motion || !b.face.animate || this.time - b.lastWobble < 0.5) return;
      b.lastWobble = this.time;
      const frames = kind === 'wall'
        ? [{ transform: 'scale(0.86, 1.1)' }, { transform: 'scale(1.05, 0.96)' }, { transform: 'scale(1)' }]
        : [{ transform: 'scale(1.16, 0.84)' }, { transform: 'scale(0.95, 1.06)' }, { transform: 'scale(1)' }];
      b.face.animate(frames, { duration: 420, easing: 'ease-out' });
    }

    render() {
      for (const b of this.bubbles) {
        b.el.style.transform = `translate3d(${(b.x - b.r).toFixed(1)}px, ${(b.y - b.r).toFixed(1)}px, 0)`;
      }
    }
  }

  window.BubbleArena = BubbleArena;
})();

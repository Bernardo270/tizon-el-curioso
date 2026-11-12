/*
 * TIZÓN EL CURIOSO — corredor de un botón
 *
 * Tizón corretea por el valle saltando rocas y recogiendo libros.
 * Sin dependencias: gráficos con Canvas 2D y sonido con WebAudio.
 *
 * Controles:
 *   ESPACIO / clic / toque  → saltar (y segundo salto en el aire)
 *   P                       → pausa
 *   M                       → silencio
 */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Constantes y utilidades
   * ------------------------------------------------------------------ */

  const W = 960;
  const H = 540;
  const TAU = Math.PI * 2;
  const GROUND = H - 104;
  const REST = GROUND - 33;

  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const DISPLAY = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const smooth = (t) => t * t * (3 - 2 * t);

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        /* sin almacenamiento: se juega igual */
      }
    },
  };

  const hexToRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  const mixColor = (a, b, t) => {
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
  };

  const rgba = (hex, alpha) => {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  /* ------------------------------------------------------------------ *
   * Curiosidades reales sobre dragones
   * ------------------------------------------------------------------ */

  const FACTS = [
    'En China, los dragones son espíritus del agua y la lluvia, símbolo de buena suerte. Casi nunca escupen fuego.',
    'Mušḫuššu, el dragón-serpiente de Mesopotamia, era el emblema del dios Marduk y aparece en la Puerta de Ishtar.',
    'El dragón rojo de Gales, Y Ddraig Goch, lleva siglos en la bandera del país: aparece ya en textos del siglo IX.',
    'Quetzalcóatl, la serpiente emplumada, era una deidad mesoamericana del viento, el conocimiento y la creación.',
    'En la mitología nórdica, Nidhogg roe sin descanso las raíces de Yggdrasil, el árbol que sostiene los mundos.',
    'Durante siglos, en China se vendieron "huesos de dragón" como medicina: en realidad eran fósiles, a veces de dinosaurios.',
    'San Jorge y el dragón se popularizó en la Leyenda Áurea, escrita por Jacopo da Varazze en el siglo XIII.',
    'En Japón, Ryūjin es el rey dragón del mar y vive en Ryūgū-jō, un palacio de coral bajo las olas.',
    'El dragón de Komodo no escupe fuego, pero su mordisco combina veneno y bacterias: es el lagarto más grande del mundo.',
    'El ouroboros, la serpiente o dragón que se muerde la cola, representa en la alquimia los ciclos y la transformación.',
    'En Beowulf, el héroe muere luchando contra un dragón que custodiaba un tesoro; solo su joven pariente Wiglaf se atreve a ayudarlo.',
    'Fafnir, de las sagas nórdicas, era un enano que se transformó en dragón por la maldición de un anillo de oro.',
  ];

  /* ------------------------------------------------------------------ *
   * Paletas del cielo
   * ------------------------------------------------------------------ */

  const PHASES = [
    { top: '#0e1a3a', bot: '#7a5c8f', sun: '#ffd9a8', far: '#2a1e45', near: '#19122c', stars: 0.85 },
    { top: '#4ea8de', bot: '#cdeafc', sun: '#fff3b0', far: '#7ea8ba', near: '#457083', stars: 0 },
    { top: '#2b2a63', bot: '#ff9f6b', sun: '#ffcf6b', far: '#4a3159', near: '#2b1d3b', stars: 0.35 },
    { top: '#060a1e', bot: '#17233f', sun: '#dfe9ff', far: '#0b1226', near: '#060a14', stars: 1 },
  ];

  function paletteAt(scroll) {
    const x = (scroll / 3200) % PHASES.length;
    const i = Math.floor(x);
    const t = smooth(x - i);
    const a = PHASES[i];
    const b = PHASES[(i + 1) % PHASES.length];
    return {
      top: mixColor(a.top, b.top, t),
      bot: mixColor(a.bot, b.bot, t),
      sun: mixColor(a.sun, b.sun, t),
      far: mixColor(a.far, b.far, t),
      near: mixColor(a.near, b.near, t),
      stars: lerp(a.stars, b.stars, t),
    };
  }

  /* ------------------------------------------------------------------ *
   * Estado
   * ------------------------------------------------------------------ */

  const archive = new Set(store.get('tizon.archive.v1', []));

  const state = {
    mode: 'menu', // menu | playing | paused | over
    time: 0,
    elapsed: 0,
    score: 0,
    distance: 0,
    speed: 360,
    best: store.get('tizon.best.v1', 0) | 0,
    coins: 0,
    books: 0,
    newRecord: false,
    shake: 0,
    flash: 0,
    spawnTimer: 1.4,
    fact: null,
    factNew: false,
    factTimer: 0,
    overTimer: 0,
  };

  const player = {
    x: 220,
    y: REST,
    vy: 0,
    onGround: true,
    jumps: 0,
    coyote: 0,
    runPhase: 0,
    wing: 0,
  };

  const keys = { jump: false };
  const pointers = new Set();

  const obstacles = [];
  const orbs = [];
  const particles = [];
  const floaters = [];
  const stars = [];
  const clouds = [];
  const bg = { scroll: 0 };

  for (let i = 0; i < 80; i++) {
    stars.push({ x: rand(0, W), y: rand(0, GROUND - 140), r: rand(0.6, 1.7), p: rand(0, TAU), s: rand(0.4, 1.4) });
  }
  for (let i = 0; i < 7; i++) {
    clouds.push({ x: rand(0, W), y: rand(40, GROUND - 210), s: rand(0.5, 1.3), a: rand(0.14, 0.34), p: rand(0.08, 0.3) });
  }

  /* ------------------------------------------------------------------ *
   * Sonido procedural
   * ------------------------------------------------------------------ */

  const audio = {
    ctx: null,
    noise: null,
    muted: !!store.get('tizon.muted.v1', false),

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch (err) {
        return;
      }
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    },

    tone(freq, dur, type, vol, slideTo, delay) {
      if (this.muted || !this.ctx) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    },

    burst(dur, vol, freq) {
      if (this.muted || !this.ctx || !this.noise) return;
      const t0 = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = 0.9;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter).connect(gain).connect(this.ctx.destination);
      src.start(t0);
      src.stop(t0 + dur);
    },

    jump() {
      this.tone(330, 0.12, 'triangle', 0.05, 660);
    },
    flap() {
      this.tone(520, 0.12, 'sine', 0.05, 900);
      this.burst(0.1, 0.03, 900);
    },
    coin() {
      this.tone(760, 0.09, 'triangle', 0.045, 1140);
    },
    book() {
      [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.045, null, i * 0.07));
    },
    hurt() {
      this.tone(170, 0.3, 'sawtooth', 0.07, 55);
      this.burst(0.3, 0.06, 250);
    },
    over() {
      [392, 330, 262].forEach((f, i) => this.tone(f, 0.32, 'triangle', 0.055, null, i * 0.15));
    },
  };

  function toggleMute() {
    audio.muted = !audio.muted;
    store.set('tizon.muted.v1', audio.muted);
    if (!audio.muted) {
      audio.init();
      audio.tone(880, 0.09, 'sine', 0.05);
    }
  }

  /* ------------------------------------------------------------------ *
   * Dibujo: ayudantes
   * ------------------------------------------------------------------ */

  function roundRect(x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  function ell(x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
  }

  function text(str, x, y, size, color, align, weight, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.font = `${weight || 700} ${size}px ${FONT}`;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function bigText(str, x, y, size, color, align, shadowColor) {
    ctx.save();
    ctx.font = `900 ${size}px ${DISPLAY}`;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = shadowColor || 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.22;
    ctx.shadowOffsetY = size * 0.06;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function wrapText(str, maxWidth, font) {
    ctx.save();
    ctx.font = font;
    const words = str.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    ctx.restore();
    return lines;
  }

  function panel(x, y, w, h, r, fill, stroke) {
    roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  /* ------------------------------------------------------------------ *
   * Dibujo: fondo
   * ------------------------------------------------------------------ */

  function drawSky(pal) {
    const grad = ctx.createLinearGradient(0, 0, 0, GROUND);
    grad.addColorStop(0, pal.top);
    grad.addColorStop(1, pal.bot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, GROUND + 2);

    if (pal.stars > 0.02) {
      for (const s of stars) {
        const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(state.time * s.s + s.p));
        ctx.globalAlpha = pal.stars * twinkle;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    const sx = W * 0.8;
    const sy = GROUND * 0.26;
    const glow = ctx.createRadialGradient(sx, sy, 8, sx, sy, 170);
    glow.addColorStop(0, pal.sun);
    glow.addColorStop(0.35, rgba('#ffd9a8', 0.15));
    glow.addColorStop(1, 'rgba(255,217,168,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, 170, 0, TAU);
    ctx.fill();

    ctx.fillStyle = pal.sun;
    ctx.beginPath();
    ctx.arc(sx, sy, 44, 0, TAU);
    ctx.fill();
  }

  function ridge(offset, baseY, amp, color, step, freq) {
    ctx.beginPath();
    ctx.moveTo(-60, GROUND + 2);
    for (let x = -60; x <= W + 60; x += step) {
      const y = baseY - (Math.sin((x + offset) * freq) * amp + Math.sin((x + offset) * freq * 2.3 + 1.3) * amp * 0.42);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W + 60, GROUND + 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawCloudShape(x, y, s, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - 26 * s, y + 4 * s, 17 * s, 0, TAU);
    ctx.arc(x, y - 6 * s, 24 * s, 0, TAU);
    ctx.arc(x + 27 * s, y + 5 * s, 16 * s, 0, TAU);
    ctx.arc(x + 4 * s, y + 12 * s, 20 * s, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawGround(pal) {
    const g = ctx.createLinearGradient(0, GROUND, 0, H);
    g.addColorStop(0, '#2b2340');
    g.addColorStop(1, '#120e20');
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND, W, H - GROUND);

    ctx.fillStyle = '#4a3d6b';
    ctx.fillRect(0, GROUND, W, 3);

    // guijarros y hierbecillas que se desplazan
    const off = bg.scroll % 210;
    for (let i = -1; i < 7; i++) {
      const x = i * 210 - off;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.arc(x + 64, GROUND + 26, 3, 0, TAU);
      ctx.arc(x + 148, GROUND + 54, 2, 0, TAU);
      ctx.arc(x + 30, GROUND + 62, 2.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = pal.near;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 100, GROUND + 4);
      ctx.lineTo(x + 96, GROUND - 9);
      ctx.moveTo(x + 104, GROUND + 4);
      ctx.lineTo(x + 108, GROUND - 6);
      ctx.stroke();
    }
  }

  function drawBackground(pal) {
    drawSky(pal);
    ridge(bg.scroll * 0.16, GROUND - 44, 66, pal.far, 26, 0.004);
    ridge(bg.scroll * 0.34 + 500, GROUND - 8, 34, pal.near, 22, 0.006);
    for (const c of clouds) drawCloudShape(c.x, c.y, c.s, c.a);
    drawGround(pal);
  }

  /* ------------------------------------------------------------------ *
   * Dibujo: Tizón
   * ------------------------------------------------------------------ */

  const BODY = '#2f9e8f';
  const BODY_DARK = '#1f756b';
  const BELLY = '#ffd9a0';
  const MEMBRANE = '#ff8a5c';
  const SPIKE = '#ffcf6a';
  const OUTLINE = 'rgba(8, 20, 26, 0.92)';

  function drawWing(x, y, angle, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-26, -30, -50, -18);
    ctx.quadraticCurveTo(-36, -8, -42, 4);
    ctx.quadraticCurveTo(-22, 0, -8, 9);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8, 4);
    ctx.quadraticCurveTo(-24, -8, -34, -4);
    ctx.moveTo(-8, 4);
    ctx.quadraticCurveTo(-26, 2, -38, 6);
    ctx.strokeStyle = 'rgba(90, 20, 10, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawLeg(x, phase, back) {
    const swing = player.onGround ? Math.sin(phase) * 0.55 : -0.5;
    ctx.save();
    ctx.translate(x, 12);
    ctx.rotate(swing);
    ctx.fillStyle = back ? BODY_DARK : BODY;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.5;
    roundRect(-4.5, 0, 9, 15, 4);
    ctx.fill();
    ctx.stroke();
    roundRect(-6, 12, 13, 6, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawDragon(p) {
    const run = p.onGround;
    const bob = run ? Math.abs(Math.sin(p.runPhase * 2)) * 2.2 : 0;
    const tilt = clamp((p.vy || 0) / 1600, -0.22, 0.26) + (run ? 0.04 : 0);
    const flap = Math.sin(state.time * 9) * 0.12 + (p.wing || 0) * 0.75;

    ctx.save();
    ctx.translate(p.x, p.y - bob);

    // Sombra en el suelo
    const shadowScale = clamp(1 - (REST - p.y) / 220, 0.35, 1);
    ctx.globalAlpha = 0.22 * shadowScale;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(0, GROUND - (p.y - REST) + 2, 34 * shadowScale, 7 * shadowScale, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.rotate(tilt);

    // Cola
    ctx.beginPath();
    ctx.moveTo(-16, -4);
    ctx.quadraticCurveTo(-52, 6, -78, -12);
    ctx.quadraticCurveTo(-56, 16, -12, 13);
    ctx.closePath();
    ctx.fillStyle = BODY_DARK;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-70, -9);
    ctx.lineTo(-92, -30);
    ctx.lineTo(-86, -1);
    ctx.closePath();
    ctx.fillStyle = MEMBRANE;
    ctx.fill();
    ctx.stroke();

    // Ala trasera
    drawWing(-2, -10, -flap * 0.9 - 0.15, BODY_DARK);

    // Patas
    drawLeg(-9, p.runPhase, true);
    drawLeg(7, p.runPhase + Math.PI, false);

    // Cuerpo
    const bodyGrad = ctx.createLinearGradient(0, -26, 0, 24);
    bodyGrad.addColorStop(0, '#49c7b2');
    bodyGrad.addColorStop(1, BODY);
    ctx.shadowColor = 'rgba(4, 14, 20, 0.4)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ell(-2, 0, 31, 23, -0.06);
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Vientre
    ell(6, 9, 19, 13, -0.03);
    ctx.fillStyle = BELLY;
    ctx.fill();
    ctx.strokeStyle = 'rgba(168, 104, 38, 0.32)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const y = 2 + i * 6;
      ctx.moveTo(-4, y);
      ctx.quadraticCurveTo(6, y + 3, 16, y);
    }
    ctx.strokeStyle = 'rgba(168, 104, 38, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Cresta
    ctx.fillStyle = SPIKE;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const x = -22 + i * 10;
      const hgt = 7 + Math.sin(i * 1.6) * 3;
      ctx.beginPath();
      ctx.moveTo(x - 4, -19);
      ctx.lineTo(x, -19 - hgt);
      ctx.lineTo(x + 5, -18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Cuello y cabeza
    ctx.beginPath();
    ctx.moveTo(12, -20);
    ctx.bezierCurveTo(24, -38, 44, -34, 51, -22);
    ctx.bezierCurveTo(60, -20, 65, -15, 62, -9);
    ctx.bezierCurveTo(60, -2, 49, -1, 43, -4);
    ctx.bezierCurveTo(37, 5, 22, 5, 13, -3);
    ctx.closePath();
    const headGrad = ctx.createLinearGradient(20, -34, 40, 2);
    headGrad.addColorStop(0, '#54cdb8');
    headGrad.addColorStop(1, BODY);
    ctx.shadowColor = 'rgba(4, 14, 20, 0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = headGrad;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Cuernos
    ctx.fillStyle = '#f6e3b8';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(26, -30);
    ctx.lineTo(21, -45);
    ctx.lineTo(32, -33);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(36, -33);
    ctx.lineTo(37, -47);
    ctx.lineTo(43, -31);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Orejita
    ctx.beginPath();
    ctx.moveTo(17, -18);
    ctx.quadraticCurveTo(2, -30, 6, -12);
    ctx.closePath();
    ctx.fillStyle = MEMBRANE;
    ctx.fill();
    ctx.stroke();

    // Ojo
    ell(46, -21, 5.4, 6.2, 0);
    ctx.fillStyle = '#fffaf0';
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#16202b';
    ctx.beginPath();
    ctx.arc(47.4, -20.5, 2.7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(48.4, -22, 1, 0, TAU);
    ctx.fill();

    // Ceja
    ctx.beginPath();
    ctx.moveTo(41, -29);
    ctx.quadraticCurveTo(47, -32, 52, -28);
    ctx.strokeStyle = 'rgba(12,24,32,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Hocico
    ctx.fillStyle = 'rgba(12,24,32,0.5)';
    ctx.beginPath();
    ctx.arc(58, -13, 1.6, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(50, -6);
    ctx.quadraticCurveTo(56, -4, 59, -8);
    ctx.strokeStyle = 'rgba(12,24,32,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Mejilla
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ff8f8f';
    ctx.beginPath();
    ctx.ellipse(42, -9, 5, 3.4, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Ala delantera
    drawWing(2, -14, flap * 0.75 - 0.1, MEMBRANE);

    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   * Entidades
   * ------------------------------------------------------------------ */

  function spawnRock(x, w, h) {
    obstacles.push({ kind: 'rock', x, w, h, seed: rand(0, TAU) });
  }

  function spawnCrystal(x) {
    obstacles.push({ kind: 'crystal', x, w: rand(18, 26), h: rand(52, 74), seed: rand(0, TAU) });
  }

  function addOrb(x, y, type) {
    orbs.push({ x, y, type, r: type === 'book' ? 16 : 11, phase: rand(0, TAU) });
  }

  function spawnWave() {
    const roll = Math.random();
    const x = W + 60;

    if (roll < 0.16 && state.elapsed > 14) {
      spawnRock(x, rand(26, 34), rand(34, 52));
      spawnRock(x + rand(180, 220), rand(24, 32), rand(34, 48));
      addOrb(x + 90, GROUND - 92, 'coin');
      addOrb(x + 110, GROUND - 118, 'coin');
      return;
    }

    if (roll < 0.34) {
      spawnCrystal(x);
      if (Math.random() < 0.7) {
        for (let i = 0; i < 3; i++) addOrb(x + 74 + i * 42, GROUND - 108 - Math.sin(i * 0.8) * 22, 'coin');
      }
      return;
    }

    if (roll < 0.86) {
      const w = rand(24, 46);
      spawnRock(x, w, rand(30, 62));
      if (Math.random() < 0.55) {
        for (let i = 0; i < 4; i++) {
          addOrb(x + 40 + i * 46, GROUND - 128 + Math.sin(i * 0.7) * 24, 'coin');
        }
      }
      return;
    }

    // Un libro para el archivo
    addOrb(x + 20, GROUND - 118, 'book');
    addOrb(x + 92, GROUND - 96, 'coin');
    addOrb(x + 138, GROUND - 126, 'coin');
  }

  function addParticle(p) {
    if (particles.length > 400) particles.shift();
    particles.push({
      x: p.x,
      y: p.y,
      vx: p.vx || 0,
      vy: p.vy || 0,
      life: p.life || 0.5,
      max: p.life || 0.5,
      size: p.size === undefined ? 4 : p.size,
      color: p.color || '#ffffff',
      grav: p.grav || 0,
      drag: p.drag === undefined ? 0.98 : p.drag,
      glow: !!p.glow,
    });
  }

  function burst(x, y, color, count, power) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const sp = rand(50, 230) * (power || 1);
      addParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.25, 0.55),
        size: rand(2, 5),
        color,
        drag: 0.93,
        glow: true,
      });
    }
  }

  function addFloater(x, y, str, color) {
    floaters.push({ x, y, str, color, life: 1.05, max: 1.05 });
  }

  function dust(x, y) {
    for (let i = 0; i < 5; i++) {
      addParticle({
        x: x + rand(-14, 6),
        y: y + rand(-2, 4),
        vx: rand(-170, -40),
        vy: rand(-70, -10),
        life: rand(0.25, 0.45),
        size: rand(2, 5),
        color: '#c7b9ee',
        drag: 0.9,
      });
    }
  }

  function collectOrb(o) {
    const idx = orbs.indexOf(o);
    if (idx >= 0) orbs.splice(idx, 1);

    if (o.type === 'coin') {
      state.coins++;
      state.score += 10;
      addFloater(o.x, o.y - 6, '+10', '#ffd166');
      burst(o.x, o.y, '#ffd166', 7, 0.7);
      audio.coin();
    } else {
      state.books++;
      state.score += 50;
      addFloater(o.x, o.y - 6, '+50', '#d6a8ff');
      burst(o.x, o.y, '#d6a8ff', 16, 1.1);
      audio.book();
      triggerFact();
    }
  }

  function triggerFact() {
    const unknown = FACTS.map((_, i) => i).filter((i) => !archive.has(i));
    const idx = unknown.length ? pick(unknown) : randInt(0, FACTS.length - 1);
    const isNew = !archive.has(idx);
    archive.add(idx);
    store.set('tizon.archive.v1', [...archive]);
    state.fact = FACTS[idx];
    state.factNew = isNew;
    state.factTimer = 8;
  }

  /* ------------------------------------------------------------------ *
   * Ciclo de juego
   * ------------------------------------------------------------------ */

  function startGame() {
    state.mode = 'playing';
    state.elapsed = 0;
    state.distance = 0;
    state.score = 0;
    state.speed = 360;
    state.coins = 0;
    state.books = 0;
    state.newRecord = false;
    state.shake = 0;
    state.flash = 0;
    state.spawnTimer = 1.3;
    state.fact = null;
    state.factTimer = 0;
    state.overTimer = 0;

    player.y = REST;
    player.vy = 0;
    player.onGround = true;
    player.jumps = 0;
    player.coyote = 0;
    player.wing = 0;

    obstacles.length = 0;
    orbs.length = 0;
    particles.length = 0;
    floaters.length = 0;

    audio.init();
  }

  function gameOver() {
    state.mode = 'over';
    state.overTimer = 0.5;
    state.shake = 16;
    state.flash = 0.85;
    const total = Math.floor(state.score);
    if (total > state.best) {
      state.best = total;
      state.newRecord = true;
      store.set('tizon.best.v1', total);
    }
    burst(player.x, player.y, '#ff6b6b', 22, 1.2);
    audio.hurt();
    audio.over();
  }

  function togglePause() {
    if (state.mode === 'playing') state.mode = 'paused';
    else if (state.mode === 'paused') state.mode = 'playing';
  }

  function pressJump() {
    if (state.mode === 'menu') {
      startGame();
      return;
    }
    if (state.mode === 'over' && state.overTimer <= 0) {
      startGame();
      return;
    }
    if (state.mode === 'paused') {
      state.mode = 'playing';
      return;
    }
    if (state.mode !== 'playing') return;

    if (player.onGround || player.coyote > 0) {
      player.vy = -720;
      player.onGround = false;
      player.jumps = 1;
      player.coyote = 0;
      player.wing = 0.6;
      dust(player.x - 12, GROUND);
      audio.jump();
    } else if (player.jumps < 2) {
      player.vy = -620;
      player.jumps = 2;
      player.wing = 1;
      for (let i = 0; i < 10; i++) {
        addParticle({
          x: player.x + rand(-12, 12),
          y: player.y + 24,
          vx: rand(-60, 160),
          vy: rand(40, 160),
          life: rand(0.2, 0.4),
          size: rand(4, 9),
          color: pick(['#ffe9a8', '#ffb340', '#ff7a3c']),
          glow: true,
          drag: 0.9,
        });
      }
      audio.flap();
    }
  }

  function updateScene(dt) {
    bg.scroll += (state.mode === 'playing' ? state.speed : 70) * dt;
    for (const c of clouds) {
      c.x -= (state.mode === 'playing' ? state.speed : 70) * c.p * dt;
      if (c.x < -90) {
        c.x = W + rand(40, 200);
        c.y = rand(40, GROUND - 210);
        c.s = rand(0.5, 1.3);
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      const damp = Math.pow(p.drag, dt * 60);
      p.vx *= damp;
      p.vy *= damp;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function updateFloaters(dt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= dt;
      f.y -= 40 * dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }
  }

  function updatePlaying(dt) {
    state.elapsed += dt;
    state.speed = 360 + Math.min(260, state.elapsed * 3.4);
    state.distance += state.speed * dt;
    state.score += state.speed * dt * 0.09;
    state.shake = Math.max(0, state.shake - dt * 44);
    state.flash = Math.max(0, state.flash - dt * 2.2);
    state.factTimer = Math.max(0, state.factTimer - dt);

    // Física del salto (mantener pulsado = salto más alto)
    const gravity = player.vy < 0 && keys.jump ? 1500 : 2500;
    player.vy += gravity * dt;
    player.y += player.vy * dt;

    if (player.y >= REST) {
      if (!player.onGround) {
        dust(player.x - 6, GROUND);
        if (player.vy > 400) state.shake = Math.max(state.shake, 3);
      }
      player.y = REST;
      player.vy = 0;
      player.onGround = true;
      player.jumps = 0;
      player.coyote = 0;
      player.runPhase += dt * 13;
    } else {
      player.onGround = false;
      if (player.coyote > 0) player.coyote -= dt;
    }

    player.wing = Math.max(0, player.wing - dt * 2.6);

    // Rocas y cristales
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.x -= state.speed * dt;
      if (o.x + o.w < -40) {
        obstacles.splice(i, 1);
        continue;
      }
      if (state.mode !== 'playing') continue;

      const px = player.x - 19;
      const py = player.y - 24;
      const hit =
        px + 38 > o.x + 5 &&
        px < o.x + o.w - 5 &&
        py + 46 > GROUND - o.h + 4 &&
        py < GROUND;
      if (hit) {
        gameOver();
        return;
      }
    }

    // Objetos
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      o.x -= state.speed * dt;
      o.phase += dt * 3;
      if (o.x < -50) {
        orbs.splice(i, 1);
        continue;
      }
      const reach = o.r + 22;
      if ((o.x - player.x) ** 2 + (o.y - player.y) ** 2 < reach * reach) {
        collectOrb(o);
      }
    }

    // Aparición de obstáculos
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnWave();
      state.spawnTimer = rand(1.05, 1.7) * clamp(380 / state.speed, 0.72, 1.12);
    }
  }

  function frame(dt) {
    state.time += dt;
    if (state.overTimer > 0) state.overTimer -= dt;

    updateScene(dt);
    updateParticles(dt);
    updateFloaters(dt);

    if (state.mode === 'playing') {
      updatePlaying(dt);
    } else {
      state.shake = Math.max(0, state.shake - dt * 44);
      state.flash = Math.max(0, state.flash - dt * 2.2);
      if (state.mode !== 'over') state.factTimer = Math.max(0, state.factTimer - dt);
      if (state.mode === 'menu') player.runPhase += dt * 8;
    }
  }

  /* ------------------------------------------------------------------ *
   * Dibujo: entidades
   * ------------------------------------------------------------------ */

  function drawObstacle(o) {
    ctx.save();
    if (o.kind === 'crystal') {
      const top = GROUND - o.h;
      const g = ctx.createLinearGradient(o.x, top, o.x + o.w, GROUND);
      g.addColorStop(0, '#c9a7ff');
      g.addColorStop(1, '#5d3f9c');
      ctx.beginPath();
      ctx.moveTo(o.x + o.w * 0.5, top);
      ctx.lineTo(o.x + o.w, GROUND - o.h * 0.22);
      ctx.lineTo(o.x + o.w * 0.72, GROUND);
      ctx.lineTo(o.x + o.w * 0.2, GROUND);
      ctx.lineTo(o.x, GROUND - o.h * 0.18);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(20, 12, 40, 0.85)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(o.x + o.w * 0.5, top + 6);
      ctx.lineTo(o.x + o.w * 0.56, GROUND - 12);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      const top = GROUND - o.h;
      const g = ctx.createLinearGradient(o.x, top, o.x, GROUND);
      g.addColorStop(0, '#736d8c');
      g.addColorStop(1, '#2e2a44');
      ctx.beginPath();
      ctx.moveTo(o.x, GROUND);
      ctx.lineTo(o.x + o.w * 0.06, GROUND - o.h * 0.66);
      ctx.lineTo(o.x + o.w * 0.34, GROUND - o.h * 0.9);
      ctx.lineTo(o.x + o.w * 0.62, GROUND - o.h * 0.62);
      ctx.lineTo(o.x + o.w * 0.88, GROUND - o.h);
      ctx.lineTo(o.x + o.w, GROUND - o.h * 0.52);
      ctx.lineTo(o.x + o.w, GROUND);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(12, 10, 24, 0.85)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(o.x + o.w * 0.4, GROUND - o.h * 0.55, 3.4, 0, TAU);
      ctx.fillStyle = 'rgba(160, 220, 255, 0.55)';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawOrb(o) {
    ctx.save();
    ctx.translate(o.x, o.y + Math.sin(o.phase) * 2.5);
    if (o.type === 'coin') {
      const squash = Math.abs(Math.cos(o.phase * 0.9)) * 0.75 + 0.25;
      ctx.shadowColor = 'rgba(255, 190, 70, 0.75)';
      ctx.shadowBlur = 16;
      const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, 12);
      g.addColorStop(0, '#fff3c4');
      g.addColorStop(0.5, '#ffcf5c');
      g.addColorStop(1, '#e0901f');
      ctx.beginPath();
      ctx.ellipse(0, 0, 11 * squash, 11, 0, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(140, 80, 10, 0.65)';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (squash > 0.55) {
        ctx.beginPath();
        ctx.arc(0, 0, 5 * squash, 0, TAU);
        ctx.strokeStyle = 'rgba(255, 255, 220, 0.75)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    } else {
      ctx.rotate(Math.sin(o.phase * 0.6) * 0.16);
      ctx.shadowColor = 'rgba(200, 140, 255, 0.9)';
      ctx.shadowBlur = 22;
      panel(-15, -18, 30, 36, 4, '#6b3fa0', 'rgba(255,255,255,0.25)');
      ctx.shadowBlur = 0;
      panel(-11, -14, 22, 28, 2, '#f6e8ff');
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const y = -9 + i * 6;
        ctx.moveTo(-6, y);
        ctx.lineTo(6, y);
      }
      ctx.strokeStyle = 'rgba(110, 70, 150, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ff7a8a';
      ctx.fillRect(-3, -18, 5, 9);
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (const p of particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.glow) ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  function drawFloaters() {
    for (const f of floaters) {
      const a = clamp(f.life / f.max, 0, 1);
      text(f.str, f.x, f.y, 17, f.color, 'center', 800, a);
    }
  }

  /* ------------------------------------------------------------------ *
   * Interfaz
   * ------------------------------------------------------------------ */

  function drawIconButton(x, y, kind) {
    panel(x, y, 34, 34, 10, 'rgba(10, 14, 30, 0.35)', 'rgba(255,255,255,0.18)');
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    if (kind === 'pause') {
      ctx.fillRect(x + 11, y + 10, 4, 14);
      ctx.fillRect(x + 19, y + 10, 4, 14);
    } else {
      ctx.beginPath();
      ctx.moveTo(x + 11, y + 12);
      ctx.lineTo(x + 11, y + 22);
      ctx.lineTo(x + 18, y + 17);
      ctx.closePath();
      ctx.fill();
      if (audio.muted) {
        ctx.beginPath();
        ctx.moveTo(x + 21, y + 12);
        ctx.lineTo(x + 27, y + 22);
        ctx.moveTo(x + 27, y + 12);
        ctx.lineTo(x + 21, y + 22);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x + 20, y + 17, 5, -0.9, 0.9);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawHUD() {
    // Récord
    text(`RÉCORD ${state.best}`, 26, 30, 11, 'rgba(223,230,255,0.55)', 'left', 700);

    // Monedas y libros
    ctx.fillStyle = '#ffcf5c';
    ctx.beginPath();
    ctx.arc(32, 52, 6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140, 80, 10, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(String(state.coins), 44, 52, 14, '#ffe7a8', 'left', 700);

    panel(78, 43, 16, 18, 2, '#6b3fa0', 'rgba(255,255,255,0.25)');
    panel(80, 45, 12, 14, 1, '#f6e8ff');
    text(String(state.books), 100, 52, 14, '#e3c7ff', 'left', 700);

    // Puntuación
    bigText(String(Math.floor(state.score)).padStart(5, '0'), W / 2, 38, 32, '#ffffff', 'center');
    text('PUNTOS', W / 2, 60, 10, 'rgba(223,230,255,0.55)', 'center', 700);

    drawIconButton(W - 50, 20, 'mute');
  }

  function drawFactToast() {
    if (!state.fact || state.factTimer <= 0) return;
    const font = `600 15px ${FONT}`;
    const lines = wrapText(state.fact, 520, font);
    const boxH = 44 + lines.length * 21;
    const boxW = 620;
    const x = (W - boxW) / 2;
    const y = H - 16 - boxH;
    const fade = clamp(Math.min(state.factTimer / 0.6, (8 - state.factTimer) / 0.3), 0, 1);

    ctx.save();
    ctx.globalAlpha = fade;
    panel(x, y, boxW, boxH, 14, 'rgba(12, 16, 34, 0.9)', 'rgba(255, 207, 92, 0.35)');

    ctx.save();
    ctx.translate(x + 34, y + 30);
    panel(-13, -15, 26, 30, 3, '#6b3fa0');
    panel(-9, -11, 18, 22, 2, '#f6e8ff');
    ctx.restore();

    text(state.factNew ? 'NUEVA CURIOSIDAD' : 'CURIOSIDAD', x + 62, y + 20, 10, '#ffcf5c', 'left', 800);
    lines.forEach((line, i) => {
      text(line, x + 62, y + 40 + i * 21, 15, '#eef1ff', 'left', 600);
    });
    ctx.restore();
  }

  function drawMenu() {
    ctx.fillStyle = 'rgba(7, 10, 24, 0.5)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(7, 10, 24, 0.35)';
    ctx.fillRect(0, GROUND, W, H - GROUND);

    bigText('TIZÓN', W / 2, 108, 72, '#ffcf5c', 'center', 'rgba(255, 120, 40, 0.35)');
    bigText('EL CURIOSO', W / 2, 164, 36, '#ffffff', 'center');
    text('Corre, salta y colecciona curiosidades en lugar de tesoros', W / 2, 202, 15, 'rgba(223,230,255,0.72)', 'center', 500);

    const controls = 'ESPACIO salta  ·  vuelve a pulsar en el aire para aletear';
    const w = 520;
    panel(W / 2 - w / 2, 232, w, 34, 10, 'rgba(255, 207, 92, 0.12)', 'rgba(255, 207, 92, 0.45)');
    text(controls, W / 2, 249, 13, '#ffe2a3', 'center', 600);

    const pulse = 0.6 + 0.4 * Math.sin(state.time * 3);
    text('Pulsa ESPACIO o toca la pantalla para empezar', W / 2, 300, 16, `rgba(255, 217, 138, ${pulse})`, 'center', 700);
    text(`Récord ${state.best}   ·   Archivo ${archive.size}/${FACTS.length} curiosidades`, W / 2, 330, 12, 'rgba(223,230,255,0.55)', 'center', 500);
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(7, 10, 24, 0.62)';
    ctx.fillRect(0, 0, W, H);
    bigText('PAUSA', W / 2, H / 2 - 18, 56, '#ffffff');
    text('Pulsa P o ESC para seguir corriendo', W / 2, H / 2 + 40, 16, 'rgba(223,230,255,0.75)', 'center', 500);
    text('Tizón está hojeando un libro.', W / 2, H / 2 + 70, 13, 'rgba(255,207,92,0.75)', 'center', 500);
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(5, 8, 20, 0.62)';
    ctx.fillRect(0, 0, W, H);

    const pw = 560;
    const ph = 318;
    const px = (W - pw) / 2;
    const py = 92;
    panel(px, py, pw, ph, 22, 'rgba(15, 20, 42, 0.94)', 'rgba(255,255,255,0.12)');

    bigText('TROPIEZO', W / 2, py + 50, 32, '#ffcf5c');
    bigText(String(Math.floor(state.score)), W / 2, py + 120, 58, '#ffffff');
    text('puntos', W / 2, py + 156, 13, 'rgba(223,230,255,0.6)', 'center', 600);

    text(
      `${state.coins} monedas   ·   ${state.books} libro${state.books === 1 ? '' : 's'}   ·   ${Math.floor(state.distance / 10)} m`,
      W / 2,
      py + 190,
      14,
      'rgba(223,230,255,0.7)',
      'center',
      500
    );

    if (state.newRecord) {
      const pulse = 0.7 + 0.3 * Math.sin(state.time * 5);
      panel(W / 2 - 108, py + 208, 216, 30, 10, `rgba(255, 207, 92, ${0.14 * pulse})`, 'rgba(255, 207, 92, 0.6)');
      text('¡NUEVO RÉCORD!', W / 2, py + 224, 14, '#ffcf5c', 'center', 800);
    } else {
      text(`Récord personal: ${state.best}`, W / 2, py + 224, 13, 'rgba(223,230,255,0.55)', 'center', 600);
    }

    text(`Archivo de curiosidades: ${archive.size}/${FACTS.length}`, W / 2, py + 258, 13, 'rgba(214,168,255,0.85)', 'center', 600);

    const pulse = 0.55 + 0.45 * Math.sin(state.time * 3);
    text('ESPACIO para intentarlo otra vez', W / 2, py + 292, 15, `rgba(255, 217, 138, ${pulse})`, 'center', 700);
  }

  /* ------------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------------ */

  function render() {
    const pal = paletteAt(bg.scroll);

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const shakeX = state.shake ? rand(-state.shake, state.shake) * 0.5 : 0;
    const shakeY = state.shake ? rand(-state.shake, state.shake) * 0.5 : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawBackground(pal);
    for (const o of obstacles) drawObstacle(o);
    for (const o of orbs) drawOrb(o);
    drawDragon(player);
    drawParticles();
    drawFloaters();

    ctx.restore();

    if (state.mode === 'menu') {
      drawMenu();
    } else {
      drawHUD();
      drawFactToast();
      if (state.mode === 'paused') drawPause();
      if (state.mode === 'over') drawGameOver();
    }

    if (state.flash > 0.01) {
      ctx.fillStyle = `rgba(255, 60, 60, ${state.flash * 0.3})`;
      ctx.fillRect(0, 0, W, H);
    }

    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.86);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    if (audio.muted) {
      text('silenciado', W - 67, 62, 9, 'rgba(255,255,255,0.4)', 'center', 600);
    }
  }

  /* ------------------------------------------------------------------ *
   * Entrada
   * ------------------------------------------------------------------ */

  function canvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }

  window.addEventListener('keydown', (e) => {
    const c = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW'].includes(c)) e.preventDefault();

    if (c === 'Space' || c === 'ArrowUp' || c === 'KeyW') {
      if (!e.repeat) {
        audio.init();
        pressJump();
      }
      keys.jump = true;
    }
    if ((c === 'KeyP' || c === 'Escape') && !e.repeat) togglePause();
    if (c === 'KeyM' && !e.repeat) toggleMute();
    if (c === 'KeyR' && !e.repeat && state.mode !== 'menu') startGame();
  });

  window.addEventListener('keyup', (e) => {
    const c = e.code;
    if (c === 'Space' || c === 'ArrowUp' || c === 'KeyW') keys.jump = false;
  });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    audio.init();
    const pos = canvasPos(e);

    if (state.mode !== 'menu' && pos.x >= W - 50 && pos.x <= W - 16 && pos.y >= 20 && pos.y <= 54) {
      toggleMute();
      return;
    }
    if (state.mode === 'paused') {
      state.mode = 'playing';
      return;
    }

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignorado */
    }
    pointers.add(e.pointerId);
    keys.jump = true;
    pressJump();
  });

  function releasePointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) keys.jump = false;
  }

  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);

  window.addEventListener('blur', () => {
    keys.jump = false;
    pointers.clear();
    if (state.mode === 'playing') state.mode = 'paused';
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'playing') state.mode = 'paused';
  });

  /* ------------------------------------------------------------------ *
   * Escalado y arranque
   * ------------------------------------------------------------------ */

  let pixelRatio = 1;

  function resize() {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * pixelRatio);
    canvas.height = Math.round(H * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  resize();
  window.addEventListener('resize', resize);

  /*
   * API para trastear desde la consola:
   *   Tizon.state.score · Tizon.player.y · Tizon.orbs · Tizon.FACTS
   */
  window.Tizon = { state, player, orbs, obstacles, archive, FACTS, bg, startGame };

  let lastTs = 0;
  function loop(ts) {
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = clamp(dt, 0, 0.05);

    frame(dt);
    render();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();

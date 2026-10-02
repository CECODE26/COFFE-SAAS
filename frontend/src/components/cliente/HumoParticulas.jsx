// Humo de la taza: vapor de partículas en un <canvas> 2D que llena su contenedor (la caja del vapor de TazaHumeante).
// Las partículas nacen sobre la superficie del café y suben despacio llevadas por un campo de flujo
// suave y sin divergencia: 2-3 columnas en S que se ondulan, se enroscan, se abren y se deshacen.
// Cada columna es una cinta sedosa (eslabones alargados encadenados a lo largo de su recorrido, con un
// núcleo fino que brilla donde la cinta se tuerce) y arriba unos soplos sueltos la difuminan.
// Rendimiento: bucle requestAnimationFrame fuera de React (sin estado por cuadro), ≤ 90 partículas,
// DPR ≤ 2, sin cuadros de menos de 10 ms (~60 fps a 120 Hz, ~72 a 144 Hz; a 60 y 90 Hz va a la tasa
// de la pantalla), pausa en segundo plano o fuera de pantalla.
// Con movimiento reducido: un solo cuadro quieto.
import React, { useLayoutEffect, useRef } from 'react';

// ---------- Simulación (sin React ni DOM) ----------
// Unidades: anchos de la caja. x desde el eje de la taza; z = altura sobre el café (hacia arriba).
const SUP_RX = 0.265; // semiejes de la elipse del café (53 % del ancho de la caja)
const SUP_RY = 0.05;
const N_COLUMNAS = 3;
const N_ESLABONES = 60; // partículas de las cintas (encadenadas por columna)
const N_SOPLOS = 30; // soplos sueltos que abren y deshacen el vapor arriba (60 + 30 = 90 como máximo)
const TASA_ESLABONES = 3.5; // por columna y segundo: eslabones seguidos a ~0.03 anchos
const VIDA_ESLABON = 5.4; // fija: los eslabones de una cinta mueren en el orden en que nacen
const TASA_SOPLOS = 2.2; // por columna y segundo, a plena intensidad
const PASO_MAX = 1 / 20; // delta-time acotado: tras un tirón el humo no salta
const INTERVALO_MIN_MS = 10; // salta cuadros solo en pantallas de más de 100 Hz (el humo es lento: más cuadros no se notan)
const PRECALENTAR = 6; // s: una vida entera, así el humo ya está formado en el primer cuadro
const AMPLITUD = 0.018;
// Ondas de la función de corriente: k (vertical), q (horizontal), c (velocidad a la que sube el dibujo), a (peso)
const ONDAS = [
  { k: 6.5, q: 2, c: 0.11, a: 1 },
  { k: 11, q: -3.5, c: 0.13, a: 0.35 },
  { k: 4, q: 7, c: 0.04, a: 0.3 },
];

const suave = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const suaveDerivada = (a, b, v) => {
  if (v <= a || v >= b) return 0;
  const t = (v - a) / (b - a);
  return (6 * t * (1 - t)) / (b - a);
};

// Azar con semilla (mulberry32): el cuadro quieto de movimiento reducido siempre es el mismo
const crearAzar = (semilla) => {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

// Perfiles de los sprites (u, v de -1 a 1): gaussiana que llega a 0 justo en el borde, sin cortes
const E5 = Math.exp(-5);
const campana = (t) => (t >= 1 ? 0 : (Math.exp(-5 * t * t) - E5) / (1 - E5));
const alfaSoplo = (u, v) => campana(Math.hypot(u, v));
// Eslabón: coseno² a lo largo (solapados a la mitad suman un trazo continuo) y campana de través
const alfaEslabon = (u, v) => (Math.abs(u) >= 1 ? 0 : Math.cos((Math.PI * u) / 2) ** 2 * campana(Math.abs(v)));

const crearHumo = (semilla) => {
  const azar = crearAzar(semilla);
  const normal = () => (azar() + azar() + azar() + azar() - 2) * 1.73; // ≈ normal(0, 1), acotada
  const vuelta = () => azar() * Math.PI * 2;
  const columnas = [];
  for (let i = 0; i < N_COLUMNAS; i++) {
    columnas.push({
      base: (i - (N_COLUMNAS - 1) / 2) * 0.09 + (azar() - 0.5) * 0.04,
      fases: ONDAS.map(vuelta),
      f1: vuelta(),
      f2: vuelta(),
      f3: vuelta(),
      f4: vuelta(),
      giro: vuelta(),
      desfase: ONDAS.map(() => 0), // fase de cada onda en este paso (depende solo del tiempo)
      mod: AMPLITUD,
      ritmo: 0.1 + azar() * 0.08,
      x: 0,
      peso: 1,
      cuentaEslabones: azar(),
      cuentaSoplos: azar(),
      ultimo: -1, // último eslabón de su cinta, para encadenar el siguiente
      ultimaSerie: -1,
    });
  }
  const particulas = [];
  for (let i = 0; i < N_ESLABONES + N_SOPLOS; i++) {
    particulas.push({
      viva: false,
      eslabon: i < N_ESLABONES,
      serie: 0,
      col: 0,
      previa: -1, // eslabón anterior (más viejo) de la misma cinta
      seriePrevia: -1,
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      edad: 0,
      vida: 1,
      vel: 1,
      tam: 1,
      estira: 1,
      deriva: 0,
      alfa: 0,
      giro: 0,
    });
  }
  return {
    azar,
    normal,
    t: azar() * 600,
    tope: 0.87, // alto / ancho de la caja
    serie: 0,
    brisa: [vuelta(), vuelta()],
    brisaAhora: 0,
    columnas,
    particulas,
    v: { x: 0, z: 0 },
  };
};

// Velocidad en (x, z) para una columna: derivadas de la función de corriente
// ψ = A(z)·Σ a·sen(k·z + q·x − k·c·t + φ) (sin divergencia: el vapor ni se amontona ni se vacía),
// más la subida y una brisa muy leve. Cerca del café A es pequeña: la cinta sale casi recta.
const flujo = (humo, col, x, z, out) => {
  const A = col.mod * (0.14 + 0.86 * suave(0.03, 0.65, z));
  const dA = col.mod * 0.86 * suaveDerivada(0.03, 0.65, z);
  let s = 0;
  let sz = 0;
  let sx = 0;
  for (let i = 0; i < ONDAS.length; i++) {
    const o = ONDAS[i];
    const fase = o.k * z + o.q * x + col.desfase[i];
    const sn = Math.sin(fase);
    const cs = Math.cos(fase);
    s += o.a * sn;
    sz += o.a * o.k * cs;
    sx += o.a * o.q * cs;
  }
  out.x = dA * s + A * sz + humo.brisaAhora * suave(0.08, 0.7, z);
  out.z = 0.085 + 0.065 * suave(0, 0.3, z) - A * sx;
};

const nacer = (humo, col, c, eslabon) => {
  const { particulas, azar, normal } = humo;
  const hasta = eslabon ? N_ESLABONES : particulas.length;
  let i = eslabon ? 0 : N_ESLABONES;
  while (i < hasta && particulas[i].viva) i++;
  if (i === hasta) return; // sin hueco libre: se salta
  const p = particulas[i];
  const lim = SUP_RX * 0.85;
  p.x = Math.max(-lim, Math.min(lim, col.x + (eslabon ? 0 : normal() * 0.035)));
  const u = p.x / SUP_RX;
  // los soplos nacen repartidos sobre la elipse del café (la mitad delantera queda bajo la caja)
  p.z = eslabon ? -0.012 : (azar() * 2 - 1) * SUP_RY * Math.sqrt(1 - u * u);
  p.vx = 0;
  p.vz = 0.085;
  p.edad = 0;
  p.col = c;
  p.viva = true;
  humo.serie += 1;
  p.serie = humo.serie;
  if (eslabon) {
    // todos los eslabones siguen exactamente el mismo recorrido: la cinta no se rompe
    p.vida = VIDA_ESLABON;
    p.vel = 1;
    p.tam = 1;
    p.estira = 1;
    p.deriva = 0;
    p.alfa = 0.25 + 0.75 * col.peso;
    p.giro = col.giro + humo.t * 0.85; // la cinta se tuerce a lo largo
    p.previa = col.ultimo;
    p.seriePrevia = col.ultimaSerie;
    col.ultimo = i;
    col.ultimaSerie = p.serie;
  } else {
    p.vida = 5 + azar() * 2.5;
    p.vel = 0.9 + azar() * 0.2;
    p.tam = 0.8 + azar() * 0.4;
    p.estira = 1.6 + azar() * 0.8;
    p.deriva = normal() * 0.014; // el vapor se abre al subir
    p.alfa = (0.05 + azar() * 0.035) * (0.4 + 0.6 * col.peso);
    p.giro = 0;
  }
};

const paso = (humo, dt) => {
  humo.t += dt;
  const { t, columnas, particulas, v } = humo;
  humo.brisaAhora = 0.016 * Math.sin(0.11 * t + humo.brisa[0]) + 0.01 * Math.sin(0.047 * t + humo.brisa[1]);
  // Fuentes: cada columna pasea despacio por la superficie y cambia de intensidad;
  // la más intensa nunca baja de 0.8, así el humo no llega a apagarse del todo
  let maximo = 0;
  for (let c = 0; c < columnas.length; c++) {
    const col = columnas[c];
    // Lo que en el flujo depende solo del tiempo se calcula una vez por paso y columna.
    // La fase deriva despacio: la silueta nunca se repite.
    col.mod = AMPLITUD * (0.7 + 0.3 * Math.sin(0.083 * t + col.f4));
    for (let i = 0; i < ONDAS.length; i++) {
      col.desfase[i] = col.fases[i] + 0.9 * Math.sin(0.05 * t + col.f1 + i * 2.1) - ONDAS[i].k * ONDAS[i].c * t;
    }
    col.x = Math.max(-0.17, Math.min(0.17, col.base + 0.045 * Math.sin(0.17 * t + col.f1) + 0.025 * Math.sin(0.39 * t + col.f2)));
    const o = 0.5 + 0.5 * Math.sin(col.ritmo * t + col.f3);
    col.peso = 0.15 + 0.85 * o * o;
    maximo = Math.max(maximo, col.peso);
  }
  const realce = Math.max(1, 0.8 / maximo);
  for (let c = 0; c < columnas.length; c++) {
    const col = columnas[c];
    col.peso = Math.min(1, col.peso * realce);
    col.cuentaEslabones += dt * TASA_ESLABONES;
    while (col.cuentaEslabones >= 1) {
      col.cuentaEslabones -= 1;
      nacer(humo, col, c, true);
    }
    col.cuentaSoplos += dt * TASA_SOPLOS * (0.3 + 0.7 * col.peso);
    while (col.cuentaSoplos >= 1) {
      col.cuentaSoplos -= 1;
      nacer(humo, col, c, false);
    }
  }
  for (let i = 0; i < particulas.length; i++) {
    const p = particulas[i];
    if (!p.viva) continue;
    p.edad += dt;
    if (p.edad >= p.vida) {
      p.viva = false;
      continue;
    }
    flujo(humo, columnas[p.col], p.x, p.z, v);
    p.vx = v.x + p.deriva * suave(0.1, 0.7, p.z);
    p.vz = v.z * p.vel;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    if (p.z > humo.tope + 0.15 || Math.abs(p.x) > 0.7) p.viva = false;
  }
};

// Avanza en pasos acotados (el precalentado entra aquí de una vez)
const avanzar = (humo, dt) => {
  let resto = dt;
  while (resto > 1e-6) {
    const h = Math.min(resto, PASO_MAX);
    paso(humo, h);
    resto -= h;
  }
};

// Opacidad relativa: nace con el café, se va despacio y se apaga cerca de los bordes de la caja
// para que nada se vea cortado. Los soplos entran lento y a media altura: abren el vapor arriba.
const opacidad = (p, tope) => {
  const u = p.edad / p.vida;
  let a = p.alfa * (1 - suave(tope - 0.32, tope - 0.05, p.z)) * (1 - suave(0.3, 0.47, Math.abs(p.x)));
  // el vapor se hace visible al separarse un poco del café (sin "enchufarse" a la superficie)
  if (p.eslabon) return a * suave(0, 0.1, p.z) * (1 - suave(0.4, 1, u));
  a *= suave(0, 0.15, u) * (1 - suave(0.35, 1, u)) * suave(0.05, 0.3, p.z);
  return a;
};

// Pinta en píxeles del lienzo (ancho x alto). sprites: { soplo, eslabon } (lienzos o imágenes)
// Orden: cintas anchas y tenues, soplos, y encima el núcleo fino y brillante de cada cinta.
const dibujarHumo = (humo, ctx, sprites, ancho, alto) => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, ancho, alto);
  const W = ancho;
  const tope = alto / ancho;
  const { particulas } = humo;
  const { soplo, eslabon } = sprites;
  const mitadSx = soplo.width / 2;
  const mitadSy = soplo.height / 2;
  const mitadEx = eslabon.width / 2;
  const mitadEy = eslabon.height / 2;

  for (let pasada = 0; pasada < 3; pasada++) {
    const tocaSoplos = pasada === 1;
    for (let i = 0; i < particulas.length; i++) {
      const p = particulas[i];
      if (!p.viva || p.eslabon === tocaSoplos) continue;
      if (tocaSoplos) {
        // Soplo: óvalo suave estirado en la dirección en que se mueve; crece al subir
        const a = opacidad(p, tope);
        if (a < 0.003) continue;
        const vel = Math.hypot(p.vx, p.vz);
        const dx = vel > 1e-5 ? p.vx / vel : 0;
        const dy = vel > 1e-5 ? -p.vz / vel : -1;
        const d = (0.08 + 0.34 * Math.max(0, p.z)) * p.tam * W;
        const kL = (d * p.estira) / soplo.width;
        const kA = d / soplo.height;
        ctx.globalAlpha = a;
        ctx.setTransform(dx * kL, dy * kL, -dy * kA, dx * kA, W * (0.5 + p.x), alto - p.z * W);
        ctx.drawImage(soplo, -mitadSx, -mitadSy);
        continue;
      }
      // Eslabón entre esta partícula y la anterior de su cinta, centrado a medio camino y el doble
      // de largo que la distancia entre ambas (los vecinos se solapan a la mitad: trazo continuo)
      const q = p.previa >= 0 ? particulas[p.previa] : null;
      if (!q || !q.viva || q.serie !== p.seriePrevia) continue;
      // la menor de las dos: el eslabón nuevo junto al café entra desde cero, sin destellos
      let a = Math.min(opacidad(p, tope), opacidad(q, tope));
      let ex = q.x - p.x;
      let ez = q.z - p.z;
      const cuerda = Math.hypot(ex, ez);
      if (a < 0.003 || cuerda < 1e-5) continue;
      ex /= cuerda;
      ez /= cuerda;
      // si el flujo estira la cinta, se afina y se aclara (sin cortes)
      const estirada = Math.min(1, 0.05 / cuerda);
      a *= 0.4 + 0.6 * estirada;
      const mz = Math.max(0, (p.z + q.z) / 2);
      // Torsión: donde la cinta se ve de canto es más estrecha y más brillante
      const canto = Math.abs(Math.cos(p.giro + p.edad * 0.9));
      let grosor;
      if (pasada === 0) {
        grosor = (0.05 + 0.15 * mz) * (0.45 + 0.55 * canto);
        a *= 0.21 * (1.25 - 0.45 * canto);
      } else {
        grosor = 0.02 + 0.035 * mz;
        a *= 0.27 * (1.3 - 0.6 * canto) * (1 - suave(0.1, 0.5, mz));
        if (a < 0.003) continue;
      }
      const kL = (2 * cuerda * W) / eslabon.width;
      const kA = (grosor * W) / eslabon.height;
      ctx.globalAlpha = a;
      ctx.setTransform(ex * kL, -ez * kL, ez * kA, ex * kA, W * (0.5 + (p.x + q.x) / 2), alto - mz * W);
      ctx.drawImage(eslabon, -mitadEx, -mitadEy);
    }
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
};
// ---------- Componente ----------

const SEMILLA_QUIETA = 42; // cuadro fijo para movimiento reducido (equilibrado y centrado)
const CREMA = [255, 251, 241]; // #FFFBF1 en el centro…
const CREMA_BORDE = [255, 248, 236]; // …#FFF8EC hacia los bordes

// Sprite pre-renderizado una vez (degradado suave crema, sin bordes)
const crearSprite = (ancho, alto, perfil) => {
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  if (!ctx) return lienzo;
  const img = ctx.createImageData(ancho, alto);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const u = ((x + 0.5) / ancho) * 2 - 1;
      const v = ((y + 0.5) / alto) * 2 - 1;
      const a = perfil(u, v);
      const m = Math.min(1, Math.hypot(u, v));
      const k = (y * ancho + x) * 4;
      for (let c = 0; c < 3; c++) img.data[k + c] = Math.round(CREMA[c] + (CREMA_BORDE[c] - CREMA[c]) * m);
      img.data[k + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return lienzo;
};

export const HumoParticulas = ({ className = '' }) => {
  const lienzoRef = useRef(null);

  // Antes de pintar: el primer cuadro ya sale con el humo formado
  useLayoutEffect(() => {
    const lienzo = lienzoRef.current;
    const ctx = lienzo?.getContext('2d');
    if (!ctx) return undefined;

    const sprites = { soplo: crearSprite(64, 64, alfaSoplo), eslabon: crearSprite(64, 32, alfaEslabon) };
    const movimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let reducir = Boolean(movimiento?.matches);
    const humo = crearHumo(reducir ? SEMILLA_QUIETA : Math.floor(Math.random() * 4294967296));
    avanzar(humo, PRECALENTAR);

    let ancho = 0;
    let alto = 0;
    let raf = 0;
    let previo = 0;
    let visible = true;

    const pintar = () => {
      if (ancho > 0 && alto > 0) dibujarHumo(humo, ctx, sprites, ancho, alto);
    };
    // Tamaño en píxeles del dispositivo (DPR ≤ 2); cambiar el tamaño borra el lienzo: se repinta enseguida
    const medir = (w, h) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nw = Math.round(w * dpr);
      const nh = Math.round(h * dpr);
      if (nw === ancho && nh === alto) return;
      ancho = nw;
      alto = nh;
      lienzo.width = nw;
      lienzo.height = nh;
      if (nw > 0) humo.tope = nh / nw;
      pintar();
    };

    const cuadro = (ahora) => {
      raf = requestAnimationFrame(cuadro);
      if (previo && ahora - previo < INTERVALO_MIN_MS) return; // a 120 Hz queda en ~60 fps y a 144 Hz en ~72
      const dt = previo ? Math.min(Math.max(0, (ahora - previo) / 1000), PASO_MAX) : 0;
      previo = ahora;
      if (dt > 0) avanzar(humo, dt);
      pintar();
    };
    const parar = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    // Anima solo si se puede ver: pestaña activa, en pantalla y sin movimiento reducido
    const revisar = () => {
      if (reducir || !visible || document.hidden) parar();
      else if (!raf) {
        previo = 0; // al volver no recupera el tiempo perdido
        raf = requestAnimationFrame(cuadro);
      }
    };

    medir(lienzo.clientWidth, lienzo.clientHeight);

    let ro = null;
    const alRedimensionar = () => medir(lienzo.clientWidth, lienzo.clientHeight);
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver((entradas) => {
        const r = entradas[entradas.length - 1]?.contentRect;
        if (r) medir(r.width, r.height);
      });
      ro.observe(lienzo);
    } else {
      window.addEventListener('resize', alRedimensionar);
    }

    let io = null;
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver((entradas) => {
        visible = entradas[entradas.length - 1]?.isIntersecting ?? true;
        revisar();
      });
      io.observe(lienzo);
    }

    const alCambiarMovimiento = (e) => {
      reducir = e.matches;
      revisar();
      pintar(); // al quedarse quieto conserva el cuadro actual
    };
    if (movimiento?.addEventListener) movimiento.addEventListener('change', alCambiarMovimiento);
    else movimiento?.addListener?.(alCambiarMovimiento); // Safari < 14

    document.addEventListener('visibilitychange', revisar);
    revisar();

    return () => {
      parar();
      ro?.disconnect();
      io?.disconnect();
      window.removeEventListener('resize', alRedimensionar);
      document.removeEventListener('visibilitychange', revisar);
      if (movimiento?.removeEventListener) movimiento.removeEventListener('change', alCambiarMovimiento);
      else movimiento?.removeListener?.(alCambiarMovimiento);
      // Libera la memoria de los lienzos (Safari en iOS limita el total)
      lienzo.width = 0;
      lienzo.height = 0;
      sprites.soplo.width = 0;
      sprites.eslabon.width = 0;
    };
  }, []);

  return (
    <canvas
      ref={lienzoRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 block h-full w-full ${className}`}
    />
  );
};

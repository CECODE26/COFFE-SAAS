import React, { useEffect, useRef, useState } from 'react';
import { motion, animate, useInView, useMotionValue, useSpring, useTransform, useReducedMotion, AnimatePresence } from 'framer-motion';

export const EASE = [0.22, 1, 0.36, 1];

// Aparece al entrar en pantalla (una sola vez)
export const Reveal = ({ children, delay = 0, y = 24, className = '', as = 'div', ...props }) => {
  const reduce = useReducedMotion();
  const Tag = motion[as] || motion.div;
  return (
    <Tag
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, ease: EASE, delay }}
      className={className}
      {...props}
    >
      {children}
    </Tag>
  );
};

// Contenedor que anima a sus hijos en cascada
export const Stagger = ({ children, className = '', gap = 0.08, as = 'div', ...props }) => {
  const Tag = motion[as] || motion.div;
  return (
    <Tag
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
      className={className}
      {...props}
    >
      {children}
    </Tag>
  );
};

export const StaggerItem = ({ children, className = '', as = 'div', ...props }) => {
  const reduce = useReducedMotion();
  const Tag = motion[as] || motion.div;
  return (
    <Tag
      variants={{
        hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 24, scale: 0.98 },
        show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: EASE } },
      }}
      className={className}
      {...props}
    >
      {children}
    </Tag>
  );
};

// Flotación suave continua
export const Float = ({ children, className = '', amplitude = 8, duration = 5, delay = 0 }) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      animate={reduce ? {} : { y: [0, -amplitude, 0] }}
      transition={{ duration, repeat: Infinity, ease: 'easeInOut', delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// Título que aparece palabra por palabra
export const Words = ({ text, className = '', delay = 0, stagger = 0.06 }) => {
  const reduce = useReducedMotion();
  return (
    <span className={className} aria-label={text}>
      {text.split(' ').map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span
            className="inline-block"
            initial={reduce ? false : { y: '110%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: EASE, delay: delay + i * stagger }}
          >
            {w}
          </motion.span>
          {i < text.split(' ').length - 1 && ' '}
        </span>
      ))}
    </span>
  );
};

// Palabra/frase que va rotando
export const Rotating = ({ items, interval = 2600, className = '' }) => {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return undefined;
    const t = setInterval(() => setI((v) => (v + 1) % items.length), interval);
    return () => clearInterval(t);
  }, [items.length, interval, reduce]);
  return (
    <span className={`relative inline-grid ${className}`}>
      {/* Reserva el ancho de la frase más larga */}
      <span className="invisible col-start-1 row-start-1">{items.reduce((a, b) => (a.length > b.length ? a : b))}</span>
      <AnimatePresence mode="wait">
        <motion.span
          key={items[i]}
          className="col-start-1 row-start-1"
          initial={{ y: 28, opacity: 0, filter: 'blur(6px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: -28, opacity: 0, filter: 'blur(6px)' }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          {items[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};

// Número que cuenta hasta el valor al entrar en pantalla
export const CountUp = ({ to, prefix = '', suffix = '', decimals = 0, duration = 1.6, className = '' }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const [val, setVal] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!inView) return undefined;
    if (reduce) {
      setVal(to);
      return undefined;
    }
    const controls = animate(0, to, { duration, ease: EASE, onUpdate: (v) => setVal(v) });
    return () => controls.stop();
  }, [inView, to, duration, reduce]);
  return (
    <span ref={ref} className={className}>
      {prefix}
      {val.toLocaleString('es-EC', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
};

// Número que "late" en vivo: sube de a poco cada cierto tiempo
export const LiveNumber = ({ start, step = [1, 4], every = 2200, prefix = '', suffix = '', decimals = 0, className = '' }) => {
  const [val, setVal] = useState(start);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return undefined;
    const t = setInterval(() => {
      const inc = step[0] + Math.random() * (step[1] - step[0]);
      setVal((v) => v + inc);
    }, every + Math.random() * 800);
    return () => clearInterval(t);
  }, [every, step, reduce]);
  return (
    <motion.span key={Math.round(val * 100)} className={`inline-block ${className}`} initial={{ y: -6, opacity: 0.4 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.35 }}>
      {prefix}
      {val.toLocaleString('es-EC', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </motion.span>
  );
};

// Cinta infinita
export const Marquee = ({ children, speed = 40, className = '' }) => (
  <div className={`marquee ${className}`} style={{ '--marquee-duration': `${speed}s` }}>
    <div className="marquee-track">
      <div className="marquee-group">{children}</div>
      <div className="marquee-group" aria-hidden="true">{children}</div>
    </div>
  </div>
);

// Tarjeta que se inclina y tiene un brillo que sigue al cursor
export const Tilt = ({ children, className = '', max = 6 }) => {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const rx = useSpring(0, { stiffness: 200, damping: 20 });
  const ry = useSpring(0, { stiffness: 200, damping: 20 });
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const glow = useTransform([gx, gy], ([x, y]) => `radial-gradient(360px circle at ${x}% ${y}%, rgba(232,162,74,0.22), transparent 60%)`);

  const onMove = (e) => {
    if (reduce) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * max * 2);
    rx.set((0.5 - py) * max * 2);
    gx.set(px * 100);
    gy.set(py * 100);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      className={`relative ${className}`}
    >
      <motion.div className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: glow }} />
      {children}
    </motion.div>
  );
};

// Parallax con el mouse: `useLayer(depth)` devuelve {x,y} para capas a distintas profundidades
export const useMouseParallax = () => {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 20 });
  const sy = useSpring(my, { stiffness: 60, damping: 20 });
  const reduce = useReducedMotion();

  const onMouseMove = (e) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  return { onMouseMove, sx, sy };
};

export const useLayer = ({ sx, sy }, depth) => {
  const x = useTransform(sx, (v) => v * depth * -1);
  const y = useTransform(sy, (v) => v * depth * -1);
  return { x, y };
};

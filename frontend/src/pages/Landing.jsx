import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { PublicLayout } from '../components/PublicLayout';
import { Reveal, Stagger, StaggerItem, Words, Rotating, CountUp, Marquee, Tilt, useMouseParallax, useLayer, EASE } from '../components/Motion';
import { HeroShowcase } from '../components/HeroShowcase';
import { OrderFlowDemo } from '../components/OrderFlowDemo';
import { SITE, PLANS, whatsappLink } from '../config/site';
import {
  ArrowRight, Armchair, Receipt, BookOpen, CalendarDays, Store, BarChart3, QrCode, ChefHat,
  Check, MessageCircle, ShieldCheck, Smartphone, Plus, Minus, Headphones, Clock3, Leaf, X,
} from 'lucide-react';

// Fotos de muestra (Unsplash). Reemplázalas por fotos propias antes de publicar.
const IMG = {
  hero: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=2400&q=80',
  barista: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=1200&q=80',
  interior: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1600&q=80',
};

const ROTATE = ['en su punto.', 'sin papelitos.', 'bajo control.', 'en tiempo real.'];

const FEATURES = [
  { icon: QrCode, title: 'Mesas con QR', text: 'Cada mesa con su código. Estado en vivo: libre, ocupada, reservada o en limpieza.' },
  { icon: Receipt, title: 'Pedidos en tiempo real', text: 'Del camarero a la barra y a la cocina, con estados claros hasta el cobro.' },
  { icon: BookOpen, title: 'Menú digital', text: 'Categorías, precios, tiempos y etiquetas de vegano, vegetariano o gluten.' },
  { icon: CalendarDays, title: 'Reservas', text: 'Agenda por mesa, notas del cliente y confirmación en un toque.' },
  { icon: Store, title: 'Varios locales', text: 'Todas tus cafeterías en un panel: equipo, ocupación y ventas de cada una.' },
  { icon: BarChart3, title: 'Reportes claros', text: 'Ventas, ocupación y pedidos en curso. Decide con números, no a ojo.' },
];

const STEPS = [
  { n: '01', title: 'Nos escribes', text: 'Por WhatsApp te mostramos el sistema con una cafetería de ejemplo.' },
  { n: '02', title: 'Configuramos tu local', text: 'Cargamos tu menú, tus mesas y tu equipo. Te enviamos los QR listos para imprimir.' },
  { n: '03', title: 'Empiezas a atender', text: 'Desde el celular, la tablet o la computadora del local. Sin instalar nada.' },
];

const ROLES = [
  { icon: Store, title: 'Dueño', text: 'Ventas y ocupación de todos tus locales.' },
  { icon: Armchair, title: 'Camarero', text: 'Sienta clientes y toma pedidos desde la mesa.' },
  { icon: ChefHat, title: 'Cocina', text: 'Ve qué preparar y marca lo que está listo.' },
  { icon: Receipt, title: 'Caja', text: 'Cobra y registra el método de pago.' },
];

const MARQUEE = ['Mesas con QR', 'Pedidos en vivo', 'Cocina y barra', 'Menú digital', 'Reservas', 'Varios locales', 'Reportes', 'Soporte por WhatsApp', 'Conforme a la LOPDP'];

const FAQ = [
  { q: '¿Necesito instalar algo?', a: 'No. COFFE-SAAS funciona en el navegador de cualquier celular, tablet o computadora con internet.' },
  { q: '¿El precio es por cafetería?', a: `Sí. Cada plan se cobra por local al mes. ${SITE.taxNote} Si tienes varios locales, escríbenos y te preparamos una propuesta.` },
  { q: '¿Cómo contrato un plan?', a: 'Escríbenos por WhatsApp desde el botón del plan que te interese. Te enviamos los datos de pago, activamos tu cuenta y te ayudamos a configurar tu local.' },
  { q: '¿Cuándo estará la facturación electrónica?', a: 'Estamos desarrollando la facturación electrónica autorizada por el SRI para el plan Mensual Pro. Si la necesitas, cuéntanos por WhatsApp y te avisamos apenas esté disponible.' },
  { q: '¿Mis datos y los de mis clientes están protegidos?', a: 'Sí. Tratamos los datos según la Ley Orgánica de Protección de Datos Personales del Ecuador: acceso por roles, contraseñas cifradas y conexiones seguras. Los datos de tu cafetería son tuyos.' },
  { q: '¿Qué pasa si quiero dejar de usar el sistema?', a: 'Nos avisas y dejamos de cobrarte desde el siguiente período. Si lo pides, te entregamos una copia de tus datos y luego los eliminamos.' },
];

const Eyebrow = ({ children, light = false }) => (
  <p className={`mb-3 font-display text-xs font-semibold uppercase tracking-[0.2em] ${light ? 'text-caramel-300' : 'text-clay-500'}`}>{children}</p>
);

const SectionTitle = ({ eyebrow, title, text, center = false, light = false }) => (
  <div className={`max-w-2xl ${center ? 'mx-auto text-center' : ''}`}>
    <Eyebrow light={light}>{eyebrow}</Eyebrow>
    <h2 className={`text-3xl font-bold sm:text-5xl ${light ? 'text-sheet' : 'text-ink'}`}>{title}</h2>
    {text && <p className={`mt-4 text-lg ${light ? 'text-sheet/70' : 'text-muted'}`}>{text}</p>}
  </div>
);

const FaqItem = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-6 py-5 text-left" aria-expanded={open}>
        <span className="font-display text-lg font-semibold text-ink">{q}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink">
          {open ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="max-w-2xl overflow-hidden leading-relaxed text-muted"
          >
            <span className="block pb-6">{a}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
};

// Barra de contacto que aparece al hacer scroll
const StickyCta = () => {
  const [show, setShow] = useState(false);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700 && window.scrollY < document.body.scrollHeight - window.innerHeight - 500);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <AnimatePresence>
      {show && !closed && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4"
        >
          <div className="card flex items-center gap-3 !rounded-full py-2 pl-5 pr-2 shadow-lift">
            <span className="hidden text-sm font-medium text-ink sm:block">¿Lo vemos en tu cafetería?</span>
            <a href={whatsappLink('Hola, quiero una demo de COFFE-SAAS.')} target="_blank" rel="noreferrer" className="btn-primary !px-4 !py-2 text-sm">
              <MessageCircle className="h-4 w-4" /> Demo por WhatsApp
            </a>
            <button onClick={() => setClosed(true)} className="rounded-full p-2 text-muted hover:bg-sheet hover:text-ink" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const Hero = () => {
  const parallax = useMouseParallax();
  const bg = useLayer(parallax, -12);
  const { scrollY } = useScroll();
  const imgY = useTransform(scrollY, [0, 600], [0, 110]);
  const imgScale = useTransform(scrollY, [0, 600], [1, 1.08]);
  const cardY = useTransform(scrollY, [0, 600], [0, 70]);

  return (
    <section onMouseMove={parallax.onMouseMove} className="relative -mt-20 min-h-[92vh] overflow-hidden pt-20">
      {/* Foto cenital a todo lo ancho, con parallax de scroll y de mouse */}
      <motion.div style={{ y: imgY, scale: imgScale, x: bg.x }} className="absolute -inset-8">
        <img src={IMG.hero} alt="" className="h-full w-full object-cover object-center" />
      </motion.div>
      {/* Velo muy suave y fundido hacia la hoja */}
      <div className="absolute inset-0 bg-sheet/10" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-sheet to-transparent" />

      <div className="relative mx-auto flex min-h-[calc(92vh-5rem)] max-w-6xl items-center justify-center px-5 py-16 sm:px-10">
        {/* Tarjeta central tipo papel */}
        <motion.div
          style={{ y: cardY }}
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
          className="relative w-full max-w-2xl rounded-2xl bg-[#fbf7f0]/95 px-7 py-12 text-center shadow-lift ring-1 ring-ink/5 backdrop-blur-sm sm:px-14 sm:py-16"
        >
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mb-5 font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-clay-500"
          >
            Software para cafeterías · Ecuador
          </motion.p>
          <h1 className="text-[2.6rem] font-extrabold leading-[1.02] text-ink sm:text-6xl lg:text-[4.25rem]">
            <Words text="Tu cafetería," delay={0.35} />
            <br />
            <Rotating items={ROTATE} className="text-clay-600" />
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.8, ease: EASE }}
            className="mx-auto mt-6 max-w-md text-base leading-relaxed text-ink/70 sm:text-lg"
          >
            Mesas, pedidos, menú y reservas en un solo sistema. Tu equipo trabaja tranquilo y tú ves el negocio desde el celular.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1, ease: EASE }}
            className="mt-8 flex flex-wrap items-center justify-center gap-4"
          >
            <a href={whatsappLink('Hola, quiero una demo de COFFE-SAAS para mi cafetería.')} target="_blank" rel="noreferrer" className="btn-primary group !px-8">
              Pedir una demo <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
            <Link to="/#demo" className="font-semibold text-ink underline-offset-4 hover:underline">
              Ver cómo fluye un pedido
            </Link>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.3 }}
            className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-ink/55 sm:text-sm"
          >
            <span className="inline-flex items-center gap-1.5"><Smartphone className="h-4 w-4 text-clay-500" /> Celular, tablet y PC</span>
            <span className="inline-flex items-center gap-1.5"><Headphones className="h-4 w-4 text-clay-500" /> Soporte en español</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-clay-500" /> Conforme a la LOPDP</span>
          </motion.div>
        </motion.div>

        <HeroShowcase parallax={parallax} />
      </div>

      {/* Indicador de scroll */}
      <motion.div
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/40 lg:flex"
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        Desliza
        <span className="h-8 w-px bg-gradient-to-b from-ink/40 to-transparent" />
      </motion.div>
    </section>
  );
};

export const Landing = () => (
  <PublicLayout>
    <Hero />

    {/* Marquesina */}
    <div className="border-y border-line py-4">
      <Marquee speed={38}>
        {MARQUEE.map((t) => (
          <span key={t} className="mx-6 inline-flex items-center gap-3 font-display text-sm font-semibold uppercase tracking-[0.18em] text-ink/70">
            <Leaf className="h-3.5 w-3.5 text-clay-500" /> {t}
          </span>
        ))}
      </Marquee>
    </div>

    {/* Cifras animadas */}
    <section className="mx-auto max-w-6xl px-5 pt-16 sm:px-8">
      <Reveal className="grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
        {[
          { to: 1, prefix: '< ', suffix: ' día', label: 'para empezar a operar' },
          { to: 0, suffix: '', label: 'instalaciones necesarias' },
          { to: 15, suffix: ' días', label: 'plazo LOPDP garantizado' },
          { to: 24, suffix: '/7', label: 'tu local bajo control' },
        ].map((s) => (
          <div key={s.label} className="px-6 py-6 text-center">
            <p className="font-display text-4xl font-extrabold text-ink">
              <CountUp to={s.to} prefix={s.prefix} suffix={s.suffix} />
            </p>
            <p className="mt-1 text-sm text-muted">{s.label}</p>
          </div>
        ))}
      </Reveal>
    </section>

    {/* Funciones con tilt + brillo */}
    <section id="funciones" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-28 sm:px-8">
      <Reveal>
        <SectionTitle eyebrow="Funciones" title="Todo lo del día a día, en un solo lugar" text="Desde que el cliente se sienta hasta que paga la cuenta." />
      </Reveal>
      <Stagger className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StaggerItem className="relative overflow-hidden rounded-3xl sm:col-span-2 lg:col-span-1 lg:row-span-2">
          <motion.img
            src={IMG.barista}
            alt="Barista preparando café"
            loading="lazy"
            className="h-full min-h-[300px] w-full object-cover"
            whileHover={{ scale: 1.05 }}
            transition={{ duration: 0.8, ease: EASE }}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent p-6 pt-24">
            <p className="font-display text-xl font-bold text-sheet">Hecho para el ritmo de una cafetería</p>
            <p className="mt-1 text-sm text-sheet/80">Rápido de usar en hora pico, claro para todo el equipo.</p>
          </div>
        </StaggerItem>
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <StaggerItem key={title}>
            <Tilt className="card group h-full p-7">
              <motion.div whileHover={{ rotate: -8, scale: 1.08 }} className="mb-6 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-clay-600 text-white">
                <Icon className="h-5 w-5" />
              </motion.div>
              <h3 className="text-xl font-bold text-ink">{title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{text}</p>
            </Tilt>
          </StaggerItem>
        ))}
      </Stagger>
    </section>

    {/* Demo: flujo de un pedido */}
    <section id="demo" className="scroll-mt-28 border-y border-line bg-white/50 py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <SectionTitle eyebrow="Míralo en acción" title="Así fluye un pedido" text="Cada tarjeta avanza sola: así lo ve tu equipo en el local, sin refrescar la pantalla." />
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink md:self-auto">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Simulación en vivo
          </span>
        </Reveal>
        <Reveal delay={0.1} className="mt-12">
          <OrderFlowDemo />
        </Reveal>
      </div>
    </section>

    {/* Cómo funciona + roles */}
    <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-28 sm:px-8">
      <div className="relative grid gap-6 overflow-hidden rounded-[32px] bg-ink text-sheet lg:grid-cols-2">
        <motion.div
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-caramel-500/25 blur-3xl"
          animate={{ x: [0, -40, 0], y: [0, 30, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <Reveal className="relative p-8 sm:p-12">
          <SectionTitle light eyebrow="Cómo funciona" title="Listo para atender en pocos días" />
          <div className="relative mt-12">
            {/* Línea que se dibuja al hacer scroll */}
            <svg className="absolute left-[7px] top-2 h-[calc(100%-1rem)] w-1" viewBox="0 0 4 100" preserveAspectRatio="none">
              <motion.line x1="2" y1="0" x2="2" y2="100" stroke="#e8a24a" strokeWidth="2" strokeLinecap="round"
                initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.6, ease: EASE }} />
            </svg>
            <Stagger as="ol" className="space-y-9" gap={0.25}>
              {STEPS.map((s) => (
                <StaggerItem as="li" key={s.n} className="relative flex gap-6 pl-8">
                  <span className="absolute left-0 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-caramel-400 ring-4 ring-ink">
                    <span className="h-1.5 w-1.5 rounded-full bg-ink" />
                  </span>
                  <div>
                    <p className="font-display text-xs font-bold text-caramel-300">{s.n}</p>
                    <p className="mt-1 text-xl font-bold">{s.title}</p>
                    <p className="mt-1 text-sheet/70">{s.text}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </Reveal>
        <Reveal delay={0.15} className="relative p-8 sm:p-12 lg:border-l lg:border-white/10">
          <Eyebrow light>Roles</Eyebrow>
          <h3 className="text-2xl font-bold">Cada persona ve lo que necesita</h3>
          <Stagger className="mt-8 grid gap-3 sm:grid-cols-2" gap={0.1}>
            {ROLES.map(({ icon: Icon, title, text }) => (
              <StaggerItem key={title}>
                <motion.div whileHover={{ y: -4, backgroundColor: 'rgba(255,255,255,0.08)' }} className="h-full rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <Icon className="h-5 w-5 text-caramel-300" />
                  <p className="mt-3 font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-sheet/70">{text}</p>
                </motion.div>
              </StaggerItem>
            ))}
          </Stagger>
        </Reveal>
      </div>
    </section>

    {/* Planes */}
    <section id="planes" className="mx-auto max-w-6xl scroll-mt-28 px-5 pb-28 sm:px-8">
      <Reveal>
        <SectionTitle center eyebrow="Planes" title="Un precio claro, por local" text="Elige tu plan y escríbenos por WhatsApp para activarlo." />
      </Reveal>

      <Stagger className="mx-auto mt-14 grid max-w-4xl gap-5 md:grid-cols-2" gap={0.15}>
        {PLANS.map((plan) => (
          <StaggerItem key={plan.id}>
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ duration: 0.4, ease: EASE }}
              className={`relative flex h-full flex-col rounded-[28px] p-8 ${plan.highlight ? 'bg-clay-600 text-white shadow-lift' : 'card'}`}
            >
              {plan.highlight && (
                <motion.span
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity }}
                  className="absolute -top-3 right-8 rounded-full bg-caramel-300 px-3 py-1 text-xs font-bold text-ink"
                >
                  Con facturación
                </motion.span>
              )}
              <p className={`font-display text-xl font-bold ${plan.highlight ? 'text-white' : 'text-ink'}`}>{plan.name}</p>
              <p className={`mt-1 text-sm ${plan.highlight ? 'text-white/70' : 'text-muted'}`}>{plan.description}</p>
              <div className="mt-6 flex items-baseline gap-2">
                <span className={`font-display text-6xl font-extrabold ${plan.highlight ? 'text-white' : 'text-ink'}`}>
                  $<CountUp to={plan.price} duration={1.2} />
                </span>
                <span className={`text-sm ${plan.highlight ? 'text-white/70' : 'text-muted'}`}>/ {plan.period}</span>
              </div>
              <p className={`mt-1 text-xs ${plan.highlight ? 'text-white/60' : 'text-muted'}`}>+ IVA</p>

              <ul className="mt-8 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className={`flex items-start gap-3 text-sm ${plan.highlight ? 'text-white/90' : 'text-ink'}`}>
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${plan.highlight ? 'text-caramel-300' : 'text-clay-500'}`} />
                    <span>
                      {f}
                      {plan.soon?.includes(f) && (
                        <span className={`ml-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${plan.highlight ? 'bg-white/15 text-caramel-200' : 'bg-caramel-300/30 text-clay-600'}`}>
                          Próximamente
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <a
                href={whatsappLink(`Hola, quiero contratar el plan ${plan.name} de COFFE-SAAS ($${plan.price}/mes + IVA). Mi cafetería se llama: `)}
                target="_blank"
                rel="noreferrer"
                className={`mt-8 ${plan.highlight ? 'btn-light' : 'btn-primary'}`}
              >
                <MessageCircle className="h-4 w-4" /> {plan.cta}
              </a>
            </motion.div>
          </StaggerItem>
        ))}
      </Stagger>

      <p className="mt-8 text-center text-sm text-muted">
        {SITE.taxNote} ¿Tienes varios locales?{' '}
        <a href={whatsappLink('Hola, tengo varios locales y quiero una propuesta de COFFE-SAAS.')} target="_blank" rel="noreferrer" className="font-semibold text-clay-600 underline-offset-4 hover:underline">
          Pide una propuesta
        </a>
        .
      </p>
    </section>

    {/* Preguntas */}
    <section id="preguntas" className="mx-auto grid max-w-6xl scroll-mt-28 gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.5fr]">
      <Reveal>
        <SectionTitle eyebrow="Preguntas frecuentes" title="Lo que suelen preguntarnos" />
        <p className="mt-4 text-muted">
          ¿Otra duda?{' '}
          <a href={whatsappLink('Hola, tengo una pregunta sobre COFFE-SAAS.')} target="_blank" rel="noreferrer" className="font-semibold text-clay-600 underline-offset-4 hover:underline">
            Escríbenos
          </a>
          .
        </p>
        <Link to="/legal/privacidad" className="card card-hover mt-8 inline-flex items-center gap-2 !rounded-2xl px-4 py-3 text-sm text-ink">
          <ShieldCheck className="h-4 w-4 text-clay-500" /> Cómo tratamos tus datos
        </Link>
      </Reveal>
      <Reveal delay={0.1} className="border-t border-line">
        {FAQ.map((item) => (
          <FaqItem key={item.q} {...item} />
        ))}
      </Reveal>
    </section>

    {/* CTA final */}
    <section className="mx-auto max-w-6xl px-5 pt-28 sm:px-8">
      <Reveal className="group relative overflow-hidden rounded-[32px]">
        <motion.img
          src={IMG.interior}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          whileHover={{ scale: 1.04 }}
          transition={{ duration: 1.2, ease: EASE }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/70 to-ink/30" />
        <div className="relative px-8 py-20 sm:px-16">
          <h2 className="max-w-xl text-3xl font-bold text-sheet sm:text-5xl">¿Te mostramos cómo funcionaría en tu cafetería?</h2>
          <p className="mt-4 max-w-md text-sheet/80">
            <Clock3 className="mr-1 inline h-4 w-4 text-caramel-300" /> Una demo de 20 minutos por WhatsApp o videollamada, con tu menú.
          </p>
          <a href={whatsappLink('Hola, quiero agendar una demo de COFFE-SAAS.')} target="_blank" rel="noreferrer" className="btn-light mt-8">
            <MessageCircle className="h-5 w-5" /> Agendar demo por WhatsApp
          </a>
        </div>
      </Reveal>
    </section>

    <StickyCta />
  </PublicLayout>
);

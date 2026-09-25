import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { SITE, whatsappLink } from '../config/site';
import { homeFor } from '../lib/roles';
import { Toldo, LogoSello, Marca } from './Decor';
import { MessageCircle, Mail, MapPin, ArrowUpRight } from 'lucide-react';

export const LEGAL_LINKS = [
  { to: '/legal/privacidad', label: 'Política de privacidad' },
  { to: '/legal/proteccion-de-datos', label: 'Protección de datos (LOPDP)' },
  { to: '/legal/terminos', label: 'Términos y condiciones' },
  { to: '/legal/cookies', label: 'Política de cookies' },
  { to: '/legal/derechos', label: 'Ejercer mis derechos' },
];

const NAV = [
  { href: '/#funciones', label: 'Funciones' },
  { href: '/#como-funciona', label: 'Cómo funciona' },
  { href: '/#planes', label: 'Planes' },
  { href: '/#preguntas', label: 'Preguntas' },
];

// Compatibilidad con imports anteriores
export const BrandModern = ({ light = false }) => <Marca light={light} />;

const DEMO_MSG = 'Hola, quiero una demo de COFFE-SAAS para mi cafetería.';

export const PublicLayout = ({ children, toldo = true }) => {
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const headerRef = useRef(null);

  // Anclas (#planes) y cambio de página
  useEffect(() => {
    setOpen(false);
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 50);
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);

  // Menú móvil: cerrar con Escape o clic fuera
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onClick = (e) => headerRef.current && !headerRef.current.contains(e.target) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  const panelHref = isAuthenticated ? homeFor(user?.role) : '/login';

  return (
    <div className="modern">
      {toldo && <Toldo />}

      <header ref={headerRef} className="relative z-40 mx-auto mt-2 flex h-[52px] w-[calc(100%-2.5rem)] max-w-[1248px] items-center gap-8 sm:w-[calc(100%-4rem)] lg:mt-4 lg:gap-11">
        <Link to="/" aria-label="COFFE-SAAS, inicio" className="flex shrink-0 items-center gap-3">
          <LogoSello size={52} />
          <span className="hidden font-serif text-lg italic font-medium text-verde-700 sm:block lg:hidden xl:block">COFFE-SAAS</span>
        </Link>

        <nav className="hidden gap-9 lg:flex" aria-label="Principal">
          {NAV.map((n) => (
            <Link key={n.href} to={n.href} className="py-3 text-[13px] font-medium uppercase tracking-[0.2em] text-verde-700 transition-colors hover:text-cobalto-500">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-6 lg:flex">
          <Link to={panelHref} className="text-[13px] font-medium uppercase tracking-[0.2em] text-verde-600 transition-colors hover:text-cobalto-500">
            {isAuthenticated ? 'Mi panel' : 'Ingresar'}
          </Link>
          <a href={whatsappLink(DEMO_MSG)} target="_blank" rel="noreferrer" className="btn-primary !min-h-[44px] !px-6">
            Pedir demo
          </a>
        </div>

        {/* Móvil: rótulo manuscrito + botón de menú */}
        <span className="ml-auto font-script text-[26px] leading-none text-oro-600 lg:hidden" aria-hidden="true">
          Gestión de cafés
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="flex h-12 w-12 items-center justify-center rounded-full text-verde-700 lg:hidden"
          aria-expanded={open}
          aria-controls="menu-publico"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        >
          <svg width="26" height="18" viewBox="0 0 26 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M1 2h24M1 9h24M7 16h18" />
          </svg>
        </button>

        {open && (
          <nav
            id="menu-publico"
            className="animate-fade-in absolute right-0 top-[calc(100%+8px)] flex min-w-[240px] flex-col rounded-2xl border border-oro-400/70 bg-marfil py-2 shadow-lift lg:hidden"
            aria-label="Principal"
          >
            {NAV.map((n) => (
              <Link key={n.href} to={n.href} className="flex min-h-[48px] items-center px-6 text-[13px] font-medium uppercase tracking-[0.2em] text-verde-700 hover:text-cobalto-500">
                {n.label}
              </Link>
            ))}
            <span className="mx-6 my-1 h-px bg-oro-200" />
            <Link to={panelHref} className="flex min-h-[48px] items-center px-6 text-[13px] font-medium uppercase tracking-[0.2em] text-verde-700 hover:text-cobalto-500">
              {isAuthenticated ? 'Mi panel' : 'Ingresar'}
            </Link>
            <a href={whatsappLink(DEMO_MSG)} target="_blank" rel="noreferrer" className="flex min-h-[48px] items-center px-6 text-[13px] font-medium uppercase tracking-[0.2em] text-cobalto-500">
              Pedir demo
            </a>
          </nav>
        )}
      </header>

      <main>{children}</main>

      <footer className="mt-28 border-t-2 border-oro-300 bg-verde-700 text-verde-100">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Marca light />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-verde-200">
              Software para cafeterías en Ecuador: mesas, pedidos, carta, reservas y, muy pronto, facturación electrónica.
            </p>
            <div className="mt-6 space-y-2.5 text-sm">
              <a href={whatsappLink('Hola, tengo una consulta sobre COFFE-SAAS.')} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-marfil">
                <MessageCircle className="h-4 w-4 text-oro-300" /> WhatsApp
              </a>
              <a href={`mailto:${SITE.contact.email}`} className="flex items-center gap-2 hover:text-marfil">
                <Mail className="h-4 w-4 text-oro-300" /> {SITE.contact.email}
              </a>
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-oro-300" /> {SITE.contact.city}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.24em] text-oro-300">Producto</p>
            <ul className="space-y-2.5 text-sm">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link to={n.href} className="hover:text-marfil">{n.label}</Link>
                </li>
              ))}
              <li>
                <Link to="/login" className="inline-flex items-center gap-1 hover:text-marfil">
                  Ingresar <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.24em] text-oro-300">Legal</p>
            <ul className="space-y-2.5 text-sm">
              {LEGAL_LINKS.map((l) => (
                <li key={l.to}>
                  <NavLink to={l.to} className={({ isActive }) => (isActive ? 'text-marfil' : 'hover:text-marfil')}>
                    {l.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-xs text-verde-300 sm:flex-row sm:justify-between sm:px-8">
            <p>© {new Date().getFullYear()} {SITE.legal.companyName} · RUC {SITE.legal.ruc}</p>
            <p>Datos protegidos conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

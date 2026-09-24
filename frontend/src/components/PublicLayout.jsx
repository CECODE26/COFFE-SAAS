import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { SITE, whatsappLink } from '../config/site';
import { homeFor } from '../lib/roles';
import { Coffee, Menu, X, MessageCircle, Mail, MapPin, User, ArrowUpRight } from 'lucide-react';

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

export const BrandModern = ({ light = false }) => (
  <span className="flex items-center gap-2">
    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${light ? 'bg-sheet text-ink' : 'bg-clay-600 text-white'}`}>
      <Coffee className="h-4 w-4" strokeWidth={2.5} />
    </span>
    <span className={`font-display text-[19px] font-bold tracking-tight ${light ? 'text-sheet' : 'text-ink'}`}>coffe</span>
  </span>
);

const DEMO_MSG = 'Hola, quiero una demo de COFFE-SAAS para mi cafetería.';

export const PublicLayout = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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

  return (
    <div className="frame modern">
      <div className="sheet">
        <header className="sticky top-0 z-40 h-20 px-3 pt-3 sm:px-6">
          <div
            className={`mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center rounded-2xl px-3 py-2.5 transition-all sm:px-4 lg:grid-cols-[1fr_auto_1fr] ${
              scrolled ? 'border border-line bg-sheet/85 shadow-soft backdrop-blur-xl' : 'border border-transparent'
            }`}
          >
            <Link to="/" aria-label="Inicio" className="justify-self-start">
              <BrandModern />
            </Link>

            <nav className="hidden items-center gap-7 lg:flex">
              {NAV.map((n) => (
                <Link key={n.href} to={n.href} className="text-sm font-medium text-ink/70 transition-colors hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </nav>

            <div className="hidden items-center justify-self-end gap-1 lg:flex">
              <a
                href={whatsappLink(DEMO_MSG)}
                target="_blank"
                rel="noreferrer"
                className="rounded-full p-2.5 text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
                aria-label="WhatsApp"
                title="WhatsApp"
              >
                <MessageCircle className="h-5 w-5" />
              </a>
              {isAuthenticated ? (
                <Link to={homeFor(user?.role)} className="btn-primary ml-2 !px-5 !py-2.5 text-sm">
                  Mi panel
                </Link>
              ) : (
                <>
                  <Link to="/login" className="rounded-full p-2.5 text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink" aria-label="Iniciar sesión" title="Iniciar sesión">
                    <User className="h-5 w-5" />
                  </Link>
                  <a href={whatsappLink(DEMO_MSG)} target="_blank" rel="noreferrer" className="btn-primary ml-2 !px-5 !py-2.5 text-sm">
                    Pedir demo
                  </a>
                </>
              )}
            </div>

            <button
              onClick={() => setOpen((v) => !v)}
              className="rounded-full p-2 text-ink hover:bg-ink/5 lg:hidden"
              aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={open}
            >
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

          {open && (
            <div className="card animate-fade-in mx-auto mt-2 max-w-6xl p-3 lg:hidden">
              {NAV.map((n) => (
                <Link key={n.href} to={n.href} className="block rounded-xl px-3 py-3 text-base font-medium text-ink hover:bg-sheet">
                  {n.label}
                </Link>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link to={isAuthenticated ? homeFor(user?.role) : '/login'} className="btn-secondary !py-2.5 text-sm">
                  {isAuthenticated ? 'Mi panel' : 'Iniciar sesión'}
                </Link>
                <a href={whatsappLink(DEMO_MSG)} target="_blank" rel="noreferrer" className="btn-primary !py-2.5 text-sm">
                  Pedir demo
                </a>
              </div>
            </div>
          )}
        </header>

        <main>{children}</main>

        <footer className="mt-28 bg-ink text-sheet/70">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <BrandModern light />
              <p className="mt-5 max-w-sm text-sm leading-relaxed">
                Software para cafeterías en Ecuador: mesas, pedidos, menú, reservas y, muy pronto, facturación electrónica.
              </p>
              <div className="mt-6 space-y-2.5 text-sm">
                <a href={whatsappLink('Hola, tengo una consulta sobre COFFE-SAAS.')} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-sheet">
                  <MessageCircle className="h-4 w-4 text-caramel-300" /> WhatsApp
                </a>
                <a href={`mailto:${SITE.contact.email}`} className="flex items-center gap-2 hover:text-sheet">
                  <Mail className="h-4 w-4 text-caramel-300" /> {SITE.contact.email}
                </a>
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-caramel-300" /> {SITE.contact.city}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-4 font-display text-xs font-semibold uppercase tracking-[0.2em] text-caramel-300">Producto</p>
              <ul className="space-y-2.5 text-sm">
                {NAV.map((n) => (
                  <li key={n.href}>
                    <Link to={n.href} className="hover:text-sheet">{n.label}</Link>
                  </li>
                ))}
                <li>
                  <Link to="/login" className="inline-flex items-center gap-1 hover:text-sheet">
                    Iniciar sesión <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-4 font-display text-xs font-semibold uppercase tracking-[0.2em] text-caramel-300">Legal</p>
              <ul className="space-y-2.5 text-sm">
                {LEGAL_LINKS.map((l) => (
                  <li key={l.to}>
                    <NavLink to={l.to} className={({ isActive }) => (isActive ? 'text-sheet' : 'hover:text-sheet')}>
                      {l.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10">
            <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-xs text-sheet/50 sm:flex-row sm:justify-between sm:px-8">
              <p>© {new Date().getFullYear()} {SITE.legal.companyName} · RUC {SITE.legal.ruc}</p>
              <p>Datos protegidos conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador.</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

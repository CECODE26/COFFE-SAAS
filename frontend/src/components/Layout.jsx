import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Card } from './Card';
import { LogoSello, Marca, ToldoFino } from './Decor';
import { navFor, ROLE_LABELS } from '../lib/roles';
import { AlertasMesero, rolConAlertas } from './AlertasMesero';
import { useMedia } from './tablero/hooks';
import { Coffee, LogOut, X } from 'lucide-react';

// Compatibilidad: algunas pantallas importan <Brand />
export const Brand = ({ light = false }) => <Marca light={light} />;

// `campana`: avisos de mesas (solo en el sidebar de escritorio y para roles de cafetería)
const SidebarContent = ({ onNavigate, campana = null }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = (user?.first_name || user?.email || '?').slice(0, 1).toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <ToldoFino />
      <div className="px-6 pb-6 pt-6">
        <Marca light subtitulo="Maison de gestión" />
      </div>

      {user?.tenant_name && (
        <div className={`mx-4 rounded-2xl border border-oro-400/40 px-4 py-3 ${campana ? 'mb-2.5' : 'mb-6'}`}>
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-oro-300">
            {user.cafeteria_name ? 'Cafetería' : 'Distribuidor'}
          </p>
          <p className="truncate font-serif text-[15px] italic text-marfil">{user.cafeteria_name || user.tenant_name}</p>
        </div>
      )}

      {campana && <div className="mx-4 mb-6">{campana}</div>}

      <nav className="flex-1 space-y-6 overflow-y-auto px-3" aria-label="Panel">
        {navFor(user?.role).map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.22em] text-verde-300">{section.title}</p>
            <div className="space-y-1">
              {section.links.map(({ path, label, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-full px-4 py-2.5 text-[13px] font-medium uppercase tracking-[0.14em] transition-colors ${
                      isActive
                        ? 'bg-marfil text-verde-700 shadow-[inset_0_0_0_1px_rgba(195,155,69,.7)]'
                        : 'text-verde-100 hover:bg-white/10 hover:text-marfil'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon aria-hidden="true" className={`h-[17px] w-[17px] ${isActive ? 'text-cobalto-500' : 'text-pistacho-300 group-hover:text-oro-300'}`} />
                      {label}
                      {isActive && <span className="ml-auto h-1.5 w-1.5 rotate-45 bg-oro-400" />}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="m-3 rounded-2xl border border-white/10 bg-verde-800/60 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-pistacho-300 font-serif italic text-verde-800 ring-1 ring-oro-400">
            {initials}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-marfil">{user?.first_name || 'Usuario'}</p>
            <p className="truncate text-xs text-verde-200">{ROLE_LABELS[user?.role] || 'Staff'}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="rounded-full p-2 text-verde-200 transition-colors hover:bg-white/10 hover:text-marfil"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const Layout = ({ children }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuth();
  // Una sola campana montada a la vez (evita avisos y sonidos duplicados):
  // en escritorio va en el sidebar; en móvil, en la barra superior.
  const escritorio = useMedia('(min-width: 1024px)');
  const conAlertas = rolConAlertas(user?.role);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="min-h-screen lg:pl-72">
      {/* Sidebar escritorio */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r-2 border-oro-300 bg-verde-700 lg:block">
        <SidebarContent campana={conAlertas && escritorio ? <AlertasMesero variante="oscuro" /> : null} />
      </aside>

      {/* Barra superior móvil */}
      <header className="sticky top-0 z-30 border-b border-oro-200 bg-crema/90 backdrop-blur lg:hidden">
        <ToldoFino />
        <div className="flex items-center justify-between px-4 py-2">
          <span className="flex items-center gap-2">
            <LogoSello size={40} />
            <span className="font-serif text-lg italic text-verde-700">COFFE-SAAS</span>
          </span>
          <div className="flex items-center gap-1">
            {conAlertas && !escritorio && <AlertasMesero variante="claro" />}
            <button
              onClick={() => setMenuOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-verde-700 hover:bg-pistacho-100"
              aria-label="Abrir menú"
              aria-expanded={menuOpen}
            >
              <svg width="24" height="17" viewBox="0 0 26 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <path d="M1 2h24M1 9h24M7 16h18" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Drawer móvil */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-verde-900/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <aside className="animate-fade-in absolute inset-y-0 left-0 w-72 border-r-2 border-oro-300 bg-verde-700 shadow-lift">
            <button
              onClick={() => setMenuOpen(false)}
              className="absolute right-3 top-9 z-10 rounded-full p-2 text-verde-200 hover:text-marfil"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <SidebarContent onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
    </div>
  );
};

export const PageHeader = ({ eyebrow, title, subtitle, actions }) => (
  <div className="animate-fade-in mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div>
      {eyebrow && <p className="mb-0.5 font-script text-[20px] leading-none text-oro-600">{eyebrow}</p>}
      <h1 className="font-serif text-[1.75rem] italic font-medium leading-[1.1] text-verde-700 sm:text-[2.1rem]">{title}</h1>
      {subtitle && <p className="mt-1 max-w-xl text-sm text-verde-600">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
  </div>
);

export const Loader = () => (
  <div className="flex h-[60vh] flex-col items-center justify-center gap-4" role="status">
    <div className="h-10 w-10 animate-spin rounded-full border-2 border-pistacho-200 border-t-cobalto-500" />
    <p className="font-script text-2xl text-oro-600">Preparando…</p>
  </div>
);

export const EmptyState = ({ icon: Icon = Coffee, title, description }) => (
  <Card className="flex flex-col items-center justify-center py-16 text-center">
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-pistacho-100 text-cobalto-500 ring-1 ring-oro-300">
      <Icon className="h-6 w-6" aria-hidden="true" />
    </div>
    <p className="font-serif text-2xl italic text-verde-700">{title}</p>
    {description && <p className="mt-1 text-sm text-verde-600">{description}</p>}
  </Card>
);

// Selector segmentado para filtros (en el celular, menos relleno para que tres opciones quepan en una fila)
export const Segmented = ({ options, value, onChange }) => (
  <div className="inline-flex flex-wrap rounded-full border border-oro-300/70 bg-marfil p-1" role="tablist">
    {options.map((o) => (
      <button
        key={o.value}
        role="tab"
        aria-selected={value === o.value}
        onClick={() => onChange(o.value)}
        className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.14em] transition-all sm:px-4 ${
          value === o.value ? 'bg-verde-700 text-marfil' : 'text-verde-600 hover:text-cobalto-500'
        }`}
      >
        {o.label}
        {o.count !== undefined && (
          <span className={`ml-1.5 ${value === o.value ? 'text-oro-300' : 'text-oro-600'}`}>{o.count}</span>
        )}
      </button>
    ))}
  </div>
);

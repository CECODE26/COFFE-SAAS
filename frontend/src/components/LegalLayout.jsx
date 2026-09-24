import React, { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { PublicLayout, LEGAL_LINKS } from './PublicLayout';
import { SITE } from '../config/site';

// Página legal con pestañas entre documentos e índice lateral.
// `sections` = [{ id, title, content }]
export const LegalLayout = ({ eyebrow = 'Legal', title, intro, sections = [], children }) => {
  const tabsRef = useRef(null);
  const { pathname } = useLocation();

  // En móvil, deja visible la pestaña activa
  useEffect(() => {
    const active = tabsRef.current?.querySelector('[aria-current="page"]');
    if (active) tabsRef.current.scrollLeft = active.offsetLeft - 16;
  }, [pathname]);

  return (
  <PublicLayout>
    <div className="mx-auto max-w-6xl px-5 pt-8 sm:px-8">
      <p className="mb-3 font-display text-xs font-semibold uppercase tracking-[0.22em] text-clay-500">{eyebrow}</p>
      <h1 className="text-4xl font-bold text-ink sm:text-5xl">{title}</h1>
      <p className="mt-3 text-sm text-muted">Última actualización: {SITE.legal.lastUpdated}</p>
      {intro && <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted">{intro}</p>}

      {/* Pestañas */}
      <nav ref={tabsRef} className="relative -mx-4 mt-10 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" aria-label="Documentos legales">
        <div className="flex min-w-max gap-1">
          {LEGAL_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-clay-600 text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="mt-12 grid gap-12 lg:grid-cols-[220px_1fr]">
        {sections.length > 0 && (
          <aside className="hidden lg:block">
            <div className="sticky top-28">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">En esta página</p>
              <ul className="space-y-2 border-l border-line text-sm">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="-ml-px block border-l border-transparent pl-4 text-muted hover:border-clay-500 hover:text-ink">
                      {i + 1}. {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}

        <div className={`legal max-w-3xl ${sections.length === 0 ? 'lg:col-span-2' : ''}`}>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-28">
              <h2>
                <span className="mr-2 text-clay-500">{i + 1}.</span>
                {s.title}
              </h2>
              {s.content}
            </section>
          ))}
          {children}
        </div>
      </div>
    </div>
  </PublicLayout>
  );
};

// Tabla simple para documentos legales
export const LegalTable = ({ head, rows }) => (
  <div className="my-6 overflow-x-auto rounded-2xl border border-line">
    <table className="w-full min-w-[560px] text-left text-sm">
      <thead className="bg-sheet text-[11px] uppercase tracking-wider text-muted">
        <tr>
          {head.map((h) => (
            <th key={h} className="px-4 py-3 font-medium">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line bg-white">
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className={`px-4 py-3 align-top ${j === 0 ? 'font-medium text-ink' : 'text-muted'}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

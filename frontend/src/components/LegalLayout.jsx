import React, { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { PublicLayout, LEGAL_LINKS } from './PublicLayout';
import { SelloGiratorio, Separador } from './Decor';
import { SITE } from '../config/site';

// Página legal con pestañas entre documentos e índice lateral.
// `sections` = [{ id, title, content }]
export const LegalLayout = ({ eyebrow = 'Documentos legales', title, intro, sections = [], children }) => {
  const tabsRef = useRef(null);
  const { pathname } = useLocation();
  const conIndice = sections.length > 0;

  // En móvil, deja visible la pestaña activa
  useEffect(() => {
    const active = tabsRef.current?.querySelector('[aria-current="page"]');
    if (active) tabsRef.current.scrollLeft = active.offsetLeft - 16;
  }, [pathname]);

  return (
  <PublicLayout>
    <div className="mx-auto max-w-6xl px-5 pt-10 sm:px-8 lg:pt-16">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-10">
        <div className="min-w-0 max-w-3xl">
          <p className="font-script text-[28px] leading-none text-oro-600 sm:text-[34px]">{eyebrow}</p>
          <h1 className="mt-3 font-serif text-[2.4rem] italic font-medium leading-[1.06] text-verde-700 sm:text-5xl lg:text-[3.6rem]">
            {title}
          </h1>
          <div className="mt-6 flex items-center gap-3" aria-hidden="true">
            <span className="h-px w-14 bg-oro-400" />
            <span className="rombo" />
            <span className="h-px w-14 bg-oro-400" />
          </div>
          <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.2em] text-verde-600">
            Última actualización: <span className="normal-case tracking-normal font-serif text-sm italic text-verde-700">{SITE.legal.lastUpdated}</span>
          </p>
          {intro && <p className="mt-6 max-w-3xl text-lg leading-relaxed text-verde-600">{intro}</p>}
        </div>

        <SelloGiratorio texto="PROTECCIÓN DE DATOS · ECUADOR ·" className="mr-2 mt-2 hidden w-32 shrink-0 md:block lg:w-36">
          <ShieldCheck className="h-9 w-9 lg:h-10 lg:w-10" strokeWidth={1.4} />
        </SelloGiratorio>
      </div>

      {/* Pestañas */}
      <nav
        ref={tabsRef}
        className="relative -mx-5 mt-12 overflow-x-auto border-b border-oro-300/70 px-5 sm:mx-0 sm:px-0"
        aria-label="Documentos legales"
      >
        <div className="flex min-w-max gap-1">
          {LEGAL_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-4 text-[12px] font-medium uppercase tracking-[0.2em] transition-colors focus-visible:outline-offset-[-2px] ${
                  isActive
                    ? 'border-cobalto-500 text-cobalto-500'
                    : 'border-transparent text-verde-600 hover:border-oro-300 hover:text-cobalto-500'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="h-1.5 w-1.5 rotate-45 bg-oro-400" aria-hidden="true" />}
                  {l.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-[230px_minmax(0,1fr)]">
        {conIndice && (
          <aside className="hidden lg:block">
            <div className="sticky top-10">
              <p className="mb-4 flex items-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-verde-600">
                <span className="rombo" aria-hidden="true" />
                En esta página
              </p>
              <ul className="space-y-0.5 border-l border-oro-300 text-sm">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="-ml-px flex gap-2 border-l border-transparent py-1.5 pl-4 leading-snug text-verde-600 transition-colors hover:border-cobalto-500 hover:text-cobalto-500"
                    >
                      <span className="font-serif italic text-oro-600">{i + 1}.</span>
                      <span>{s.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}

        <div
          className={`legal min-w-0 max-w-3xl ${
            conIndice
              ? 'rounded-[2rem] border border-oro-300/70 bg-marfil px-5 py-9 shadow-soft sm:px-10 sm:py-12'
              : 'lg:col-span-2'
          }`}
        >
          {sections.map((s, i) => (
            <React.Fragment key={s.id}>
              {i > 0 && <Separador className="my-10" />}
              <section id={s.id} className="scroll-mt-28">
                <h2>
                  <span className="mr-2 text-oro-600">{i + 1}.</span>
                  {s.title}
                </h2>
                {s.content}
              </section>
            </React.Fragment>
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
  <div className="my-6 overflow-x-auto rounded-2xl border border-oro-300/70 bg-marfil">
    <table className="w-full min-w-[560px] text-left text-sm">
      <thead className="bg-pistacho-100 text-[11px] uppercase tracking-[0.18em] text-verde-700">
        <tr>
          {head.map((h) => (
            <th key={h} scope="col" className="border-b border-oro-300/70 px-4 py-3.5 font-medium">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-oro-200/70">
        {rows.map((r, i) => (
          <tr key={i} className="transition-colors hover:bg-crema/70">
            {r.map((c, j) => (
              <td key={j} className={`px-4 py-3 align-top leading-relaxed ${j === 0 ? 'font-medium text-verde-700' : 'text-verde-600'}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

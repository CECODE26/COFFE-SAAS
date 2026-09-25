import React, { useEffect, useState } from 'react';
import { Layout, PageHeader, Loader, EmptyState } from '../components/Layout';
import { Badge } from '../components/StatusBadge';
import { money } from '../components/Stats';
import { BookOpen, Clock } from 'lucide-react';
import api from '../services/api';

export const Menu = () => {
  const [menuByCategory, setMenuByCategory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMenu = async () => {
      setLoading(true);
      try {
        // Fetch menu grouped by category
        const response = await api.get('/menu/items/by_category/');
        setMenuByCategory(response.data);
      } catch (error) {
        console.error('Error loading menu:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMenu();
  }, []);

  return (
    <Layout>
      {loading ? (
        <Loader />
      ) : (
        <>
          <PageHeader
            eyebrow="Carta de la casa"
            title="Menú"
            subtitle="Lo que servimos hoy, organizado por categoría."
          />

          {menuByCategory.length === 0 ? (
            <EmptyState icon={BookOpen} title="No hay menú disponible" description="Agrega productos desde el panel de administración." />
          ) : (
            <div className="space-y-12 sm:space-y-14">
              {menuByCategory.map((categoryGroup) => (
                <section key={categoryGroup.category.id} className="animate-fade-in">
                  {/* Encabezado de la carta: cursiva, filete y rombo dorado */}
                  <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {categoryGroup.category.icon && (
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pistacho-100 text-xl ring-1 ring-oro-300"
                        aria-hidden="true"
                      >
                        {categoryGroup.category.icon}
                      </span>
                    )}
                    <h2 className="min-w-0 font-serif text-3xl italic font-medium leading-tight text-verde-700 sm:text-[2.1rem]">
                      {categoryGroup.category.name}
                    </h2>
                    <span className="flex min-w-[3rem] flex-1 items-center gap-2" aria-hidden="true">
                      <span className="h-px flex-1 bg-oro-300" />
                      <span className="rombo" />
                      <span className="h-px w-5 bg-oro-300" />
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-verde-600">
                      {categoryGroup.items.length} productos
                    </span>
                  </div>

                  {/* Hoja de la carta */}
                  <div className="relative rounded-3xl border border-oro-200/80 bg-marfil p-3 shadow-soft sm:p-5">
                    <span
                      className="pointer-events-none absolute inset-1.5 rounded-[1.25rem] border border-oro-300/50"
                      aria-hidden="true"
                    />
                    <div className="relative grid grid-cols-1 gap-x-10 gap-y-1 md:grid-cols-2">
                      {categoryGroup.items.map((item) => (
                        <article
                          key={item.id}
                          className="group flex gap-4 rounded-2xl p-3 transition-colors hover:bg-crema"
                        >
                          {item.image && (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="h-20 w-16 shrink-0 rounded-arco object-cover ring-1 ring-oro-400/70"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            {/* Nombre ····· precio, estilo carta */}
                            <div className="flex items-baseline gap-2">
                              <h3 className="min-w-0 font-serif text-lg italic font-medium leading-snug text-verde-700">{item.name}</h3>
                              <span className="mb-1 min-w-[1.5rem] flex-1 border-b-2 border-dotted border-oro-300" aria-hidden="true" />
                              <span className="shrink-0 font-serif text-lg italic font-medium text-cobalto-500">{money(item.price)}</span>
                            </div>

                            {item.description && (
                              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-verde-600">{item.description}</p>
                            )}

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {item.is_vegan ? (
                                <Badge tone="sage">Vegano</Badge>
                              ) : item.is_vegetarian ? (
                                <Badge tone="sage">Vegetariano</Badge>
                              ) : null}
                              {item.has_gluten && <Badge tone="honey">Gluten</Badge>}
                              {item.preparation_time && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.14em] text-verde-600">
                                  <Clock className="h-3.5 w-3.5 text-oro-600" aria-hidden="true" />
                                  {item.preparation_time} min
                                </span>
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  );
};

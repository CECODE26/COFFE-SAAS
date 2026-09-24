import React, { useEffect, useState } from 'react';
import { Layout, PageHeader, Loader, EmptyState } from '../components/Layout';
import { Badge } from '../components/StatusBadge';
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
            <div className="space-y-14">
              {menuByCategory.map((categoryGroup) => (
                <section key={categoryGroup.category.id} className="animate-fade-in">
                  <div className="mb-6 flex items-center gap-4">
                    {categoryGroup.category.icon && (
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-foam text-xl">
                        {categoryGroup.category.icon}
                      </span>
                    )}
                    <h2 className="text-3xl font-medium text-espresso-800">{categoryGroup.category.name}</h2>
                    <span className="h-px flex-1 bg-espresso-100" />
                    <span className="text-xs uppercase tracking-wider text-espresso-300">
                      {categoryGroup.items.length} productos
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-x-10 gap-y-2 md:grid-cols-2">
                    {categoryGroup.items.map((item) => (
                      <article
                        key={item.id}
                        className="group flex gap-4 rounded-2xl p-3 transition-colors hover:bg-paper"
                      >
                        {item.image && (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-20 w-20 shrink-0 rounded-xl object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          {/* Nombre ····· precio, estilo carta */}
                          <div className="flex items-baseline gap-2">
                            <h3 className="font-serif text-lg font-medium text-espresso-800">{item.name}</h3>
                            <span className="mb-1 flex-1 border-b border-dotted border-espresso-200" />
                            <span className="font-serif text-lg font-medium text-brass-600">${item.price}</span>
                          </div>

                          {item.description && (
                            <p className="mt-1 line-clamp-2 text-sm text-espresso-400">{item.description}</p>
                          )}

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {item.is_vegan ? (
                              <Badge tone="sage">Vegano</Badge>
                            ) : item.is_vegetarian ? (
                              <Badge tone="sage">Vegetariano</Badge>
                            ) : null}
                            {item.has_gluten && <Badge tone="honey">Gluten</Badge>}
                            {item.preparation_time && (
                              <span className="inline-flex items-center gap-1 text-xs text-espresso-300">
                                <Clock className="h-3.5 w-3.5" />
                                {item.preparation_time} min
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
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

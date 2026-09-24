import React, { useEffect, useState } from 'react';
import { useData } from '../hooks/useData';
import { Navbar } from '../components/Navbar';
import { Card } from '../components/Card';
import { Leaf, Flame } from 'lucide-react';
import api from '../services/api';

export const Menu = () => {
  const [categories, setCategories] = useState([]);
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

  if (loading) {
    return (
      <div>
        <Navbar />
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Menú</h1>

        {menuByCategory.length === 0 ? (
          <Card className="text-center py-8">
            <p className="text-gray-600">No hay menú disponible</p>
          </Card>
        ) : (
          menuByCategory.map((categoryGroup) => (
            <div key={categoryGroup.category.id} className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span>{categoryGroup.category.icon}</span>
                {categoryGroup.category.name}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryGroup.items.map((item) => (
                  <Card
                    key={item.id}
                    className="hover:shadow-lg transition-shadow overflow-hidden"
                  >
                    {item.image && (
                      <div className="w-full h-32 bg-gray-200 mb-3 rounded overflow-hidden">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
                      <span className="text-xl font-bold text-primary-600">${item.price}</span>
                    </div>

                    {item.description && (
                      <p className="text-sm text-gray-600 mb-3">{item.description}</p>
                    )}

                    {/* Dietary Info */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {item.is_vegetarian && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                          <Leaf className="w-3 h-3" />
                          Vegetariano
                        </span>
                      )}
                      {item.is_vegan && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                          <Leaf className="w-3 h-3" />
                          Vegano
                        </span>
                      )}
                      {item.has_gluten && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs font-medium">
                          <Flame className="w-3 h-3" />
                          Gluten
                        </span>
                      )}
                    </div>

                    {/* Preparation Time */}
                    <div className="text-xs text-gray-500">
                      ⏱️ {item.preparation_time} min
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Datos públicos del sitio. Edita aquí precios, contacto y datos legales:
// la landing y todas las páginas legales leen de este archivo.
// Los valores entre [corchetes] son pendientes de completar antes de publicar.

export const SITE = {
  name: 'COFFE-SAAS',
  tagline: 'Gestión de cafeterías',
  url: 'https://coffesaas.com',

  contact: {
    whatsapp: '593900000000', // [número de WhatsApp con código de país, sin + ni espacios]
    email: 'hola@coffesaas.com', // [email comercial]
    privacyEmail: 'privacidad@coffesaas.com', // [email del delegado de protección de datos]
    city: 'Quito, Ecuador', // [ciudad]
  },

  legal: {
    companyName: '[Razón social]',
    ruc: '[RUC]',
    address: '[Dirección del domicilio legal]',
    dpoName: '[Nombre del Delegado de Protección de Datos]',
    lastUpdated: '24 de septiembre de 2026',
  },

  currency: 'USD',
  taxNote: 'Precios en dólares, más IVA (15%).',
};

export const PLANS = [
  {
    id: 'mensual',
    name: 'Mensual',
    price: 70,
    period: 'mes por local',
    description: 'Todo lo que necesitas para operar tu cafetería.',
    features: [
      'Mesas ilimitadas con código QR',
      'Pedidos, barra y cocina en tiempo real',
      'Menú digital con categorías y alérgenos',
      'Reservas con confirmación',
      'Usuarios y roles ilimitados',
      'Reportes de ventas y ocupación',
      'Soporte por WhatsApp',
    ],
    cta: 'Contratar Mensual',
  },
  {
    id: 'pro',
    name: 'Mensual Pro',
    price: 90, // [precio del plan Pro por confirmar]
    period: 'mes por local',
    description: 'Todo el plan Mensual, más facturación electrónica.',
    highlight: true,
    features: [
      'Todo lo del plan Mensual',
      'Facturación electrónica SRI',
      'Varios locales en un solo panel',
      'Soporte prioritario',
      'Capacitación inicial para tu equipo',
    ],
    soon: ['Facturación electrónica SRI'],
    cta: 'Contratar Pro',
  },
];

export const whatsappLink = (message) =>
  `https://wa.me/${SITE.contact.whatsapp}?text=${encodeURIComponent(message)}`;

/** @type {import('tailwindcss').Config} */

// Diseño "Pistacho y oro": crema, verde pistacho, verde bosque, cobalto y oro.
const verde = {
  50: '#f3f7ee',
  100: '#e3ecd8',
  200: '#c9d9b5',
  300: '#a9c28e',
  400: '#7c9e5c',
  500: '#5c7b43',
  600: '#4a6334',
  700: '#2a4520',
  800: '#1f3517',
  900: '#162711',
};
const pistacho = {
  50: '#f6faf1',
  100: '#eef5e6',
  200: '#dbe9cb',
  300: '#bfd8a5',
  400: '#a3c486',
  500: '#7c9e5c',
};
const cobalto = {
  50: '#eef1fa',
  100: '#dde3f4',
  200: '#b9c5ea',
  400: '#4a64b8',
  500: '#22409a',
  600: '#1b3380',
  700: '#152866',
};
const oro = {
  50: '#fbf6e7',
  100: '#f6ecd2',
  200: '#ead39a',
  300: '#d8b45c',
  400: '#c39b45',
  500: '#b38a36',
  600: '#8f6b21',
  700: '#6f521a',
};

module.exports = {
  content: [
    "./public/index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Playfair Display"', 'Didot', 'Georgia', 'serif'],
        display: ['"Playfair Display"', 'Didot', 'Georgia', 'serif'],
        sans: ['Jost', 'Futura', '"Century Gothic"', 'system-ui', 'sans-serif'],
        script: ['Parisienne', '"Snell Roundhand"', 'cursive'],
      },
      colors: {
        // ---- Tokens del diseño (usar estos en código nuevo) ----
        verde,
        pistacho,
        cobalto,
        oro,
        crema: '#FBF6EA',
        marfil: '#FFFBF1',

        // ---- Alias de compatibilidad: nombres anteriores apuntando a la nueva paleta ----
        espresso: verde,
        primary: verde,
        brass: oro,
        caramel: oro,
        clay: { 500: oro[600], 600: verde[700], 700: cobalto[500] },
        cream: '#FBF6EA',
        paper: '#FFFBF1',
        foam: pistacho[100],
        sheet: '#FBF6EA',
        ink: verde[800],
        muted: verde[600],
        line: '#E7DDBF',
        // Estados
        sage: { 100: verde[100], 600: verde[500], 700: verde[700] },
        terracotta: { 100: '#F6E1D9', 600: '#A4452F', 700: '#83341F' },
        honey: { 100: oro[100], 600: oro[500], 700: oro[600] },
        slate: { 100: cobalto[100], 600: cobalto[500], 700: cobalto[600] },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(42, 69, 32, 0.05), 0 6px 18px -8px rgba(42, 69, 32, 0.14)',
        lift: '0 2px 4px rgba(42, 69, 32, 0.06), 0 16px 36px -12px rgba(42, 69, 32, 0.22)',
        oro: 'inset 0 0 0 4px currentColor, inset 0 0 0 5px #C9A64F',
      },
      borderRadius: {
        xl2: '1.25rem',
        arco: '9999px 9999px 0 0',
      },
      letterSpacing: {
        etiqueta: '0.2em',
      },
    },
  },
  plugins: [],
}

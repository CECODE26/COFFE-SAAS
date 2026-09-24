/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        // Espresso: fondos oscuros, texto principal
        espresso: {
          50: '#f6f1ec',
          100: '#e9ded3',
          200: '#d3bfad',
          300: '#b39680',
          400: '#8c6b55',
          500: '#6b4e3b',
          600: '#533b2c',
          700: '#3d2b20',
          800: '#2b1e16',
          900: '#1c130d',
        },
        // Brass: acento cálido (caramelo / latón)
        brass: {
          50: '#fbf5ea',
          100: '#f4e6cb',
          200: '#e9cc98',
          300: '#dcae64',
          400: '#cf9442',
          500: '#b87a2e',
          600: '#9a6224',
          700: '#7b4c1f',
        },
        // Superficies claras
        cream: '#f7f1e8',
        paper: '#fcfaf6',
        foam: '#efe6d8',
        // Estados en tonos terrosos
        sage: { 100: '#e6ede2', 600: '#5b7a55', 700: '#48623f' },
        terracotta: { 100: '#f5e2db', 600: '#b0523a', 700: '#8f3f2b' },
        honey: { 100: '#f7ebcf', 600: '#a8761c', 700: '#86600f' },
        slate: { 100: '#e3eaee', 600: '#51707f', 700: '#3f5967' },
        // Tema moderno (sitio público): tostado oscuro + caramelo
        roast: {
          950: '#0e0906',
          900: '#160f0a',
          800: '#20160f',
          700: '#2c1f16',
          600: '#3d2c20',
          500: '#55402f',
        },
        caramel: {
          200: '#f7d9a8',
          300: '#f2c27a',
          400: '#e8a24a',
          500: '#d9892f',
          600: '#b86f22',
        },
        latte: '#f6eee2',
        mocha: '#b9a592',
        // Tema claro editorial (sitio público)
        sheet: '#f4efe7',
        ink: '#1a120d',
        muted: '#6f6259',
        line: '#e4dcd1',
        clay: { 500: '#7a3f34', 600: '#5c2b26', 700: '#48201c' },
        frame: '#5a3c2e',
        // Compatibilidad con clases antiguas
        primary: {
          50: '#f6f1ec',
          100: '#e9ded3',
          200: '#d3bfad',
          300: '#b39680',
          400: '#8c6b55',
          500: '#6b4e3b',
          600: '#533b2c',
          700: '#3d2b20',
          800: '#2b1e16',
          900: '#1c130d',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(43, 30, 22, 0.04), 0 4px 16px -4px rgba(43, 30, 22, 0.08)',
        lift: '0 2px 4px rgba(43, 30, 22, 0.05), 0 12px 32px -8px rgba(43, 30, 22, 0.18)',
        glow: '0 0 80px -16px rgba(232, 162, 74, 0.55)',
        glass: '0 1px 0 rgba(255,255,255,0.06) inset, 0 20px 50px -20px rgba(0,0,0,0.6)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
}

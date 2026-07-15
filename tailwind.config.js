/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Subster palette — slate base with a warm "vinyl" accent.
        brand: {
          50: '#fdf4ff',
          400: '#e879f9',
          500: '#d946ef',
          600: '#c026d3',
        },
      },
      fontFamily: {
        sans: ['system-ui', 'Avenir', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

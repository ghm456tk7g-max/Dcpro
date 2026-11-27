import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f1216',
        panel: '#181c23',
        panel2: '#1f242d',
        line: '#262c36',
        muted: '#8b93a1',
        accent: { DEFAULT: '#10b981', light: '#34d399', dark: '#059669' },
        gold: { DEFAULT: '#f5c451', dark: '#b8860b' },
        silver: '#c0c7d2',
        bronze: '#cd7f32',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
        display: ['Rubik', '"Inter Variable"', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 24px -4px rgba(16,185,129,0.55)',
        gold: '0 0 28px -6px rgba(245,196,81,0.7)',
      },
    },
  },
  plugins: [
    // tablet:text-xl -> nur im Tablet-Anzeigemodus
    plugin(({ addVariant }) => addVariant('tablet', '.tablet &')),
  ],
};

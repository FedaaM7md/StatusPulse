/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/web/index.html', './src/web/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        panel: 'rgb(var(--c-panel) / <alpha-value>)',
        panel2: 'rgb(var(--c-panel2) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-ink': 'rgb(var(--c-accent-ink) / <alpha-value>)',
        up: 'rgb(var(--c-up) / <alpha-value>)',
        degraded: 'rgb(var(--c-degraded) / <alpha-value>)',
        down: 'rgb(var(--c-down) / <alpha-value>)',
        maint: 'rgb(var(--c-maint) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Readex Pro"', '"Segoe UI"', 'Tahoma', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Readex Pro"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '3px',
        sm: '2px',
        md: '4px',
        lg: '6px',
        xl: '8px',
        '2xl': '8px',
        '3xl': '10px',
      },
      boxShadow: {
        panel: '0 1px 0 rgba(255,255,255,0.02) inset, 0 12px 28px -24px rgba(0,0,0,0.8)',
        lift: '0 18px 40px -32px rgba(0,0,0,0.75)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        scan: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 180ms ease-out both',
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
        scan: 'scan 2.8s linear infinite',
      },
    },
  },
  plugins: [],
};

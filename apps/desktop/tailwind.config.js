/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  // The app toggles `.light` on <html>; without this, `dark:` variants would
  // track the OS prefers-color-scheme instead of the in-app theme.
  darkMode: ['variant', '&:where(:root:not(.light) *)'],
  theme: {
    extend: {
      colors: {
        // Divider color matching border-subtle so `bg-subtle` works for
        // w-px/h-px separator elements.
        subtle: 'var(--border-subtle)',
        surface: {
          base: 'var(--bg-base)',
          DEFAULT: 'var(--bg-surface)',
          raised: 'var(--bg-surface-raised)',
          inset: 'var(--bg-inset)',
          input: 'var(--bg-input)',
          nav: 'var(--bg-nav)',
          tooltip: 'var(--bg-tooltip)',
          overlay: 'var(--bg-overlay)',
          'overlay-light': 'var(--bg-overlay-light)',
          'overlay-subtle': 'var(--bg-overlay-subtle)',
          solid: 'var(--bg-solid)',
        },
        content: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          disabled: 'var(--text-disabled)',
        },
      },
      borderColor: {
        DEFAULT: 'var(--border-default)',
        subtle: 'var(--border-subtle)',
        strong: 'var(--border-strong)',
      },
      ringOffsetColor: {
        DEFAULT: 'var(--ring-offset)',
      },
      boxShadowColor: {
        DEFAULT: 'var(--shadow-color)',
      },
    },
  },
  plugins: [],
};

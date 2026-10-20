// Theme colours are CSS variables, which Tailwind cannot fade on its own: without this, `bg-surface-raised/40`
// and the like silently produce no colour at all.
const withAlpha = (name) => ({ opacityValue }) =>
  opacityValue === undefined ? `var(${name})` : `color-mix(in srgb, var(${name}) calc(${opacityValue} * 100%), transparent)`;

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
        subtle: withAlpha('--border-subtle'),
        surface: {
          base: withAlpha('--bg-base'),
          DEFAULT: withAlpha('--bg-surface'),
          solid: withAlpha('--bg-surface-solid'),
          raised: withAlpha('--bg-surface-raised'),
          inset: withAlpha('--bg-inset'),
          input: withAlpha('--bg-input'),
          nav: withAlpha('--bg-nav'),
          tooltip: withAlpha('--bg-tooltip'),
          overlay: withAlpha('--bg-overlay'),
          'overlay-light': withAlpha('--bg-overlay-light'),
          'overlay-subtle': withAlpha('--bg-overlay-subtle'),
          solid: withAlpha('--bg-solid'),
        },
        content: {
          DEFAULT: withAlpha('--text-primary'),
          secondary: withAlpha('--text-secondary'),
          tertiary: withAlpha('--text-tertiary'),
          disabled: withAlpha('--text-disabled'),
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

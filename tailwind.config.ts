import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      borderRadius: { sm: '4px', md: '6px', lg: '8px' },
      colors: {
        background: 'hsl(var(--bg-base))',
        foreground: 'hsl(var(--fg-primary))',
        card: 'hsl(var(--bg-surface))',
        muted: 'hsl(var(--bg-surface-2))',
        'muted-foreground': 'hsl(var(--fg-muted))',
        border: 'hsl(var(--border-subtle))',
        primary: 'hsl(var(--accent))',
        'primary-foreground': 'hsl(var(--accent-fg))',
        success: 'hsl(var(--status-success))',
        warning: 'hsl(var(--status-warning))',
        danger: 'hsl(var(--status-danger))',
        info: 'hsl(var(--status-info))'
      },
      transitionDuration: { 120: '120ms', 180: '180ms' }
    }
  },
  plugins: []
};

export default config;

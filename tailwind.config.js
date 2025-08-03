/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // FlowSwitch Design System (matches index.css)
        "flow-bg-primary": "oklch(0.08 0.02 240)",
        "flow-bg-secondary": "oklch(0.12 0.02 240)",
        "flow-bg-tertiary": "oklch(0.16 0.02 240)",
        "flow-surface": "oklch(0.14 0.02 240)",
        "flow-surface-elevated": "oklch(0.18 0.02 240)",
        "flow-border": "oklch(0.22 0.02 240)",
        "flow-border-accent": "oklch(0.35 0.08 240)",
        "flow-text-primary": "oklch(0.95 0.01 240)",
        "flow-text-secondary": "oklch(0.75 0.02 240)",
        "flow-text-muted": "oklch(0.55 0.02 240)",
        "flow-accent-blue": "oklch(0.65 0.15 240)",
        "flow-accent-blue-hover": "oklch(0.70 0.15 240)",
        "flow-accent-green": "oklch(0.65 0.15 140)",
        "flow-accent-red": "oklch(0.55 0.15 20)",
        "flow-accent-purple": "oklch(0.60 0.15 280)",
        "flow-accent-purple-hover": "oklch(0.65 0.15 280)",

        // For overlays, charts, etc.
        "flow-shadow-sm": "0 2px 8px oklch(0.05 0.02 240 / 0.4)",
        "flow-shadow-md": "0 4px 16px oklch(0.05 0.02 240 / 0.5)",
        "flow-shadow-lg": "0 8px 32px oklch(0.05 0.02 240 / 0.6)",

        // Chart colors (optional, if used)
        "flow-chart-1": "oklch(0.646 0.222 41.116)",
        "flow-chart-2": "oklch(0.6 0.118 184.704)",
        "flow-chart-3": "oklch(0.398 0.07 227.392)",
        "flow-chart-4": "oklch(0.828 0.189 84.429)",
        "flow-chart-5": "oklch(0.769 0.188 70.08)",
        border: "#2C2C2C",                     // used in `border-border`
        ring: "#00BFFF"
      },
      boxShadow: {
        // Custom shadows matching your CSS variables
        "flow-shadow-sm": "0 2px 8px oklch(0.05 0.02 240 / 0.4)",
        "flow-shadow-md": "0 4px 16px oklch(0.05 0.02 240 / 0.5)",
        "flow-shadow-lg": "0 8px 32px oklch(0.05 0.02 240 / 0.6)",
      },
      borderRadius: {
        'sm': 'calc(0.625rem - 4px)',
        'md': 'calc(0.625rem - 2px)',
        'lg': '0.625rem',
        'xl': 'calc(0.625rem + 4px)',
      },
    },
  },
  plugins: [],
};

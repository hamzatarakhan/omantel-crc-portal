/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        // Omantel brand — exact hexes pulled from omantel.om's own logo.svg (.a = wordmark, .b = accent mark)
        brand: {
          50: '#eeecfe',
          100: '#dcd6fd',
          200: '#bfb3fb',
          300: '#9986f7',
          400: '#7659f2',
          500: '#4f2bec',
          600: '#2d13ea',
          700: '#2410c4',
          800: '#1e0f9f',
          900: '#190f72',
        },
        accent: {
          50: '#fff4e9',
          100: '#ffe3c6',
          200: '#ffc589',
          300: '#ffa34d',
          400: '#ff8c1f',
          500: '#ff7800',
          600: '#ea6e00',
          700: '#c25b00',
          800: '#9c4900',
          900: '#7d3b00',
          teal: '#0f9c8f',
        },
        status: {
          normal: '#0e9f6e',
          amber: '#e3a008',
          orange: '#ea6e00',
          red: '#e02424',
          info: '#2d13ea',
          neutral: '#8589a3',
        },
        surface: {
          DEFAULT: '#ffffff',
          subtle: '#f8f8fb',
          border: '#e3e2ec',
        },
        ink: {
          900: '#191733',
          700: '#413e5c',
          500: '#6c698a',
          400: '#9997ae',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Inter"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #2d13ea 0%, #6c3cf0 100%)',
        'sidebar-gradient': 'linear-gradient(180deg, #1d0f8c 0%, #14082e 100%)',
      },
      screens: {
        xs: '480px',
      },
    },
  },
  corePlugins: {
    preflight: false,
  },
  plugins: [],
};

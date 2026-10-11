/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        carbon: '#1B1815',
        vino: '#6E1423',
        'vino-light': '#8B1F2F',
        piedra: '#C2A06C',
        'piedra-suave': '#EAD9B4',
        marfil: '#F6F1E7',
      },
      fontFamily: {
        primary: ['Manrope', '-apple-system', 'sans-serif'],
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      spacing: {
        'sp-xs': '8px',
        'sp-sm': '16px',
        'sp-md': '24px',
        'sp-lg': '48px',
        'sp-xl': '80px',
        'sp-2xl': '120px',
      },
      borderRadius: {
        'r-sm': '4px',
        'r-md': '10px',
        'r-lg': '16px',
      },
      maxWidth: {
        container: '1100px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s cubic-bezier(0.4,0,0.2,1) forwards',
        'fade-in': 'fade-in 0.8s cubic-bezier(0.4,0,0.2,1) forwards',
        'scale-in': 'scale-in 0.4s cubic-bezier(0.4,0,0.2,1) forwards',
        'slide-down': 'slide-down 0.3s cubic-bezier(0.4,0,0.2,1) forwards',
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2D6A4F',
          50: '#F0FAF4',
          100: '#DCFCE7',
          200: '#BBF7D0',
          300: '#95D5B2',
          400: '#52B788',
          500: '#2D6A4F',
          600: '#1E4D38',
          700: '#143526',
          800: '#0C1F16',
          900: '#060F0A',
        },
        secondary: '#52B788',
        accent: '#95D5B2',
        background: '#F8FFF4',
        jungle: {
          light: '#95D5B2',
          mid: '#52B788',
          dark: '#2D6A4F',
          darker: '#1B4332',
        },
      },
      fontFamily: {
        sans: ['Inter', 'System'],
      },
    },
  },
  plugins: [],
};

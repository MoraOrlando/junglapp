/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
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
        },
        secondary: '#52B788',
        accent: '#95D5B2',
        background: '#F8FFF4',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // keep in sync with the inline cubic-beziers used in
      // components/IPhoneMockup.tsx (dot indicator: in-out-strong; confirm
      // pulse: out-strong), components/StaggerReveal.tsx (out-strong), and
      // dashboard/stores/import/page.tsx (progress bar: out-strong)
      transitionTimingFunction: {
        'out-strong': 'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out-strong': 'cubic-bezier(0.77, 0, 0.175, 1)',
      },
    },
  },
  plugins: [],
};

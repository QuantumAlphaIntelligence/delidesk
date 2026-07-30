/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        delivai: {
          'blue-dark': '#0D3C4F',
          'blue-medium': '#1E6C85',
          'neon-green': '#47F2C7',
          'text-white': '#FFFFFF',
          'text-gray': '#F5F7FA',
          orange: '#FF6B35',
          amber: '#FFB347',
          green: '#4CAF50'
        }
      },
      backgroundImage: {
        'gradient-delivai': 'linear-gradient(135deg, #1E6C85 0%, #0D3C4F 100%)'
      },
      fontFamily: {
        sans: ['Poppins', 'Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}

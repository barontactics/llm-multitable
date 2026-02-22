/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#07080d',
          1: '#0d0f1a',
          2: '#131627',
          3: '#1a1e33',
          4: '#222840',
        },
        accent: {
          green: '#00ff9d',
          blue: '#00b4ff',
          amber: '#ffb347',
          red: '#ff4d6d',
          purple: '#bf5af2',
        },
      },
      animation: {
        'pulse-attention': 'pulseAttention 1.2s ease-in-out infinite',
        'pulse-slow': 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-in': 'bounceIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
      },
      keyframes: {
        pulseAttention: {
          '0%, 100%': {
            boxShadow: '0 0 0 0 rgba(0, 255, 157, 0), 0 0 20px 4px rgba(0, 255, 157, 0.15)',
          },
          '50%': {
            boxShadow: '0 0 0 4px rgba(0, 255, 157, 0.4), 0 0 40px 8px rgba(0, 255, 157, 0.25)',
          },
        },
        bounceIn: {
          '0%': { transform: 'scale(0.92)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      boxShadow: {
        'attention': '0 0 0 2px #00ff9d, 0 0 30px 6px rgba(0,255,157,0.3)',
        'table': '0 4px 24px rgba(0,0,0,0.5)',
        'modal': '0 20px 80px rgba(0,0,0,0.8)',
      },
    },
  },
  plugins: [],
}

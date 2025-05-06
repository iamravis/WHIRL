import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      animation: {
        'spin-slow': 'spin 5s linear infinite',
      },
      typography: (theme: any) => ({
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: theme('colors.gray.700'),
            h1: {
              color: theme('colors.gray.900'),
              fontWeight: '700',
              marginTop: '1.5em',
              marginBottom: '0.5em',
            },
            h2: {
              color: theme('colors.gray.900'),
              fontWeight: '600',
              marginTop: '1.25em',
              marginBottom: '0.5em',
            },
            h3: {
              color: theme('colors.gray.900'),
              fontWeight: '600',
              marginTop: '1em',
              marginBottom: '0.5em',
            },
            ul: {
              marginTop: '0.5em',
              marginBottom: '1em',
            },
            ol: {
              marginTop: '0.5em',
              marginBottom: '1em',
            },
            'ul > li': {
              paddingLeft: '0.75em',
            },
            'ol > li': {
              paddingLeft: '0.5em',
            },
            'ul > li::before': {
              backgroundColor: theme('colors.gray.500'),
            },
            strong: {
              color: theme('colors.gray.900'),
              fontWeight: '600',
            },
            a: {
              color: theme('colors.blue.600'),
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline',
              },
            },
            code: {
              color: theme('colors.indigo.700'),
              fontWeight: '500',
              backgroundColor: theme('colors.gray.100'),
              borderRadius: '0.25rem',
              padding: '0.125rem 0.25rem',
            },
            pre: {
              backgroundColor: theme('colors.gray.100'),
              borderWidth: '1px',
              borderColor: theme('colors.gray.200'),
              borderRadius: '0.5rem',
              padding: '1rem',
            },
            blockquote: {
              fontStyle: 'italic',
              borderLeftWidth: '0.25rem',
              borderLeftColor: theme('colors.gray.300'),
              paddingLeft: '1rem',
            },
          },
        },
        dark: {
          css: {
            color: theme('colors.gray.300'),
            h1: {
              color: theme('colors.gray.100'),
            },
            h2: {
              color: theme('colors.gray.100'),
            },
            h3: {
              color: theme('colors.gray.100'),
            },
            strong: {
              color: theme('colors.gray.100'),
            },
            'ul > li::before': {
              backgroundColor: theme('colors.gray.400'),
            },
            code: {
              color: theme('colors.indigo.300'),
              backgroundColor: theme('colors.gray.800'),
            },
            pre: {
              backgroundColor: theme('colors.gray.800'),
              borderColor: theme('colors.gray.700'),
            },
            blockquote: {
              borderLeftColor: theme('colors.gray.700'),
            },
          },
        },
      }),
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    function({ addUtilities }: { addUtilities: any }) {
      const newUtilities = {
        '.scrollbar-hide': {
          /* Firefox */
          'scrollbar-width': 'none',
          /* IE and Edge */
          '-ms-overflow-style': 'none',
          /* Chrome, Safari and Opera */
          '&::-webkit-scrollbar': {
            display: 'none'
          },
        },
      }
      addUtilities(newUtilities)
    }
  ],
}

export default config 
import sharedColors from './colors';
import sharedRadius from './radius';
import sharedSpacing from './spacing';

export const tailwindPreset = {
  theme: {
    extend: {
      colors: sharedColors,
      borderRadius: sharedRadius,
      spacing: sharedSpacing,
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
};

export { sharedColors, sharedRadius, sharedSpacing };

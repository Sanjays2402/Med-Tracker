import { tailwindPreset } from '@med/config/tailwind-preset';

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [tailwindPreset],
  content: ['./app/**/*.{ts,tsx,mdx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  darkMode: 'class',
};

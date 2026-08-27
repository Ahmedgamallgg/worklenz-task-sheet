// colors.ts
// Aligned with client-portal dark mode colors for consistency
export const colors = {
  white: '#fff',
  // Seven C's Creative Hub brand tokens
  hanBlue: '#3F54D1',
  unBlue: '#5280E2',
  robinEgg: '#15CDCB',
  eucalyptus: '#4FE0B5',
  raisinBlack: '#212226',
  brandPrimary: '#3F54D1',
  brandSecondary: '#5280E2',
  brandAccent: '#15CDCB',

  darkGray: '#12131a', // Seven C's dark layout background
  darkContainer: '#1e2030', // Seven C's surface background in dark mode
  lightGray: '#707070',
  deepLightGray: '#d1d0d3',
  lightBeige: '#fde8b5',
  skyBlue: '#3F54D1', // Primary brand color
  midBlue: '#5280E2',
  paleBlue: '#eef2ff',
  vibrantOrange: '#f56a00',
  limeGreen: '#52c41a',
  lightGreen: '#c2e4d0',
  yellow: '#f8d914',
  darkYellow: '#d4b106',
  orange: '#ff7a45',
  red: '#ff4d4f',
  transparent: 'transparent',
};

export const applyCssVariables = () => {
  const root = document.documentElement;
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--color-${key}`, value);
  });
};

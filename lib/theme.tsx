import { createTheme, MantineColorsTuple } from '@mantine/core';

const primary: MantineColorsTuple = [
  '#e7f3ff',
  '#d1e4ff',
  '#a2c7ff',
  '#6fa8ff',
  '#4589ff',
  '#2f7bff',
  '#1a6eff',
  '#0058e6',
  '#0049cc',
  '#0039b2'
];

const secondary: MantineColorsTuple = [
  '#f0f9ff',
  '#e0f2fe',
  '#bae6fd',
  '#7dd3fc',
  '#38bdf8',
  '#0ea5e9',
  '#0284c7',
  '#0369a1',
  '#075985',
  '#0c4a6e'
];

export const theme = createTheme({
  colors: {
    primary,
    secondary,
  },
  primaryColor: 'primary',
  fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
  defaultRadius: 'md',
  components: {
    Button: {
      defaultProps: {
        size: 'md',
      },
    },
    TextInput: {
      defaultProps: {
        size: 'md',
      },
    },
    Select: {
      defaultProps: {
        size: 'md',
      },
    },
    Paper: {
      defaultProps: {
        shadow: 'sm',
        radius: 'md',
      },
    },
    Card: {
      defaultProps: {
        shadow: 'sm',
        radius: 'md',
      },
    },
  },
});

export const darkTheme = createTheme({
  ...theme,
  colors: {
    primary,
    secondary,
    dark: [
      '#f8fafc',
      '#f1f5f9',
      '#e2e8f0',
      '#cbd5e1',
      '#94a3b8',
      '#64748b',
      '#475569',
      '#334155',
      '#1e293b',
      '#0f172a',
    ],
  },
  primaryColor: 'primary',
});

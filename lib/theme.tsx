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
  primaryShade: { light: 7, dark: 6 },
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  headings: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontWeight: '650',
  },
  fontSizes: { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem' },
  defaultRadius: 'md',
  radius: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px' },
  components: {
    Button: { defaultProps: { size: 'md' } },
    ActionIcon: { defaultProps: { size: 'lg' } },
    TextInput: { defaultProps: { size: 'md' } },
    Select: { defaultProps: { size: 'md' } },
    Textarea: { defaultProps: { size: 'md' } },
    PinInput: { defaultProps: { size: 'md' } },
    Card: { defaultProps: { withBorder: true, shadow: 'xs', radius: 'lg' } },
    Paper: { defaultProps: { withBorder: true, shadow: 'xs', radius: 'lg' } },
    Modal: { defaultProps: { radius: 'lg', centered: true, overlayProps: { blur: 2 } } },
    Drawer: { defaultProps: { radius: 'lg' } },
    Menu: { defaultProps: { shadow: 'md' } },
    Tooltip: { defaultProps: { events: { hover: true, focus: true, touch: true } } },
  },
});

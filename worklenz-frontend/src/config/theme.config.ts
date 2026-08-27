import { theme } from '@/shared/antd-imports';
import type { ThemeConfig } from 'antd';

export const getThemeConfig = (currentTheme: 'light' | 'dark'): ThemeConfig => ({
  algorithm: currentTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
  token: {
    colorPrimary: '#3F54D1',
    borderRadius: 6,
    fontFamily:
      "'Rubik', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    colorBgLayout: currentTheme === 'dark' ? '#12131a' : '#f8f9f1',
    colorBgContainer: currentTheme === 'dark' ? '#1e2030' : '#ffffff',
    colorText: currentTheme === 'dark' ? '#e8eaf6' : '#1a1a2e',
    colorTextSecondary:
      currentTheme === 'dark' ? '#a0a8d0' : '#555566',
    colorBorder: currentTheme === 'dark' ? '#2e3150' : '#e2e4f0',
    colorBorderSecondary: currentTheme === 'dark' ? '#252839' : '#f0f3f2',
    colorFillSecondary:
      currentTheme === 'dark' ? 'rgba(63, 84, 209, 0.08)' : 'rgba(63, 84, 209, 0.04)',
    colorFillTertiary:
      currentTheme === 'dark' ? 'rgba(63, 84, 209, 0.05)' : 'rgba(63, 84, 209, 0.02)',
  },
  components: {
    Layout: {
      siderBg: currentTheme === 'dark' ? '#12131a' : '#ffffff',
      headerBg: currentTheme === 'dark' ? '#1e2030' : '#ffffff',
      bodyBg: currentTheme === 'dark' ? '#12131a' : '#f8f9f1',
    },
    Menu: {
      colorBgContainer: 'transparent',
      itemBg: 'transparent',
      itemSelectedBg: currentTheme === 'dark' ? 'rgba(63, 84, 209, 0.20)' : '#eef2ff',
      itemHoverBg: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
      itemSelectedColor: '#3F54D1',
      itemColor: currentTheme === 'dark' ? '#e8eaf6' : '#1a1a2e',
      itemMarginBlock: 4,
      itemMarginInline: 8,
      itemPaddingInline: 16,
      itemBorderRadius: 6,
    },
    Card: {
      borderRadiusLG: 8,
      paddingLG: 24,
    },
    Segmented: {
      itemSelectedBg: currentTheme === 'dark' ? '#1f1f1f' : '#ffffff',
      itemSelectedColor: currentTheme === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.88)',
      itemHoverBg: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.06)',
      itemColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.65)',
      trackBg: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
      trackPadding: 2,
      borderRadius: 6,
      borderRadiusSM: 4,
    },
    Button: {
      borderRadius: 6,
      controlHeight: 36,
    },
    Input: {
      borderRadius: 6,
      controlHeight: 36,
    },
    Select: {
      borderRadius: 6,
      controlHeight: 36,
    },
    Table: {
      borderRadius: 8,
      headerBg: currentTheme === 'dark' ? '#1f1f1f' : '#fafafa',
    },
    Statistic: {
      contentFontSize: 28,
    },
    Typography: {
      titleMarginBottom: 0,
      titleMarginTop: 0,
    },
  },
});

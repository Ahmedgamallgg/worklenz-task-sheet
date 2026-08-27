import { describe, it, expect } from 'vitest';
import { Language } from '@/features/i18n/localesSlice';

describe('Language and Region Settings', () => {
  it('should support Arabic language option', () => {
    expect(Language.AR).toBe('ar');
  });

  it('should include Arabic in supported languages list', () => {
    const supportedLanguages = Object.values(Language);
    expect(supportedLanguages).toContain('ar');
    expect(supportedLanguages).toContain('en');
    expect(supportedLanguages).toContain('es');
    expect(supportedLanguages).toContain('pt');
    expect(supportedLanguages).toContain('de');
    expect(supportedLanguages).toContain('alb');
    expect(supportedLanguages).toContain('zh_cn');
  });
});

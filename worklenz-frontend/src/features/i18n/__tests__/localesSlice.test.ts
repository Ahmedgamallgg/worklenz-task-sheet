import { describe, it, expect, beforeEach, vi } from 'vitest';
import localesReducer, {
  Language,
  setLanguage,
  applyLanguageFromUser,
} from '../localesSlice';

describe('localesSlice with Arabic locale support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have AR = "ar" defined in Language enum', () => {
    expect(Language.AR).toBe('ar');
    expect(Object.values(Language)).toContain('ar');
  });

  it('should set Arabic language in state and localStorage', () => {
    const initialState = { lng: Language.EN };
    const nextState = localesReducer(initialState, setLanguage(Language.AR));

    expect(nextState.lng).toBe(Language.AR);
    expect(localStorage.setItem).toHaveBeenCalledWith('i18nextLng', 'ar');
  });

  it('should apply Arabic language from user profile', () => {
    applyLanguageFromUser('ar');
    expect(localStorage.setItem).toHaveBeenCalledWith('i18nextLng', 'ar');
  });

  it('should ignore unsupported languages in applyLanguageFromUser', () => {
    applyLanguageFromUser('unsupported_lang');
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});

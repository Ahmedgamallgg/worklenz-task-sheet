import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient, { refreshCsrfToken } from '../api-client';
import { authApiService } from './auth.api.service';

vi.mock('../api-client', () => ({
  default: {
    post: vi.fn(),
  },
  refreshCsrfToken: vi.fn(),
}));

describe('authApiService CSRF handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { done: true } });
    vi.mocked(refreshCsrfToken).mockResolvedValue('new-token');
  });

  it.each([
    ['login', () => authApiService.login({} as any)],
    ['signup', () => authApiService.signUp({})],
  ])('refreshes the token after %s regenerates the session', async (_name, authenticate) => {
    await authenticate();

    expect(refreshCsrfToken).toHaveBeenCalledTimes(1);
  });
});

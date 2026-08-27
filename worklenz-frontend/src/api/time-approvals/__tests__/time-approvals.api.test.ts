import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '@/api/api-client';
import { timeApprovalsApiService } from '../time-approvals.api.service';
import { TaskTimeApprovalStatus } from '@/types/time-approval.types';

vi.mock('@/api/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('timeApprovalsApiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits time for approval with correct endpoint', async () => {
    const mockResponse = { data: { done: true, body: { id: 'appr-1', status: 'PENDING' } } };
    (apiClient.post as any).mockResolvedValue(mockResponse);

    const res = await timeApprovalsApiService.submit('task-123');
    expect(apiClient.post).toHaveBeenCalledWith(expect.stringContaining('/time-approvals/submit/task-123'));
    expect(res.done).toBe(true);
  });

  it('fetches pending approvals with query parameters', async () => {
    const mockResponse = { data: { done: true, body: [] } };
    (apiClient.get as any).mockResolvedValue(mockResponse);

    const params = { status: TaskTimeApprovalStatus.PENDING, over_estimate: true };
    const res = await timeApprovalsApiService.getPendingApprovals(params);

    expect(apiClient.get).toHaveBeenCalledWith(
      expect.stringContaining('/time-approvals/pending'),
      { params }
    );
    expect(res.done).toBe(true);
  });

  it('approves a submission', async () => {
    const mockResponse = { data: { done: true, body: { id: 'appr-1', status: 'APPROVED' } } };
    (apiClient.post as any).mockResolvedValue(mockResponse);

    const res = await timeApprovalsApiService.approve('appr-1', { manager_comment: 'Good job' });
    expect(apiClient.post).toHaveBeenCalledWith(
      expect.stringContaining('/time-approvals/appr-1/approve'),
      { manager_comment: 'Good job' }
    );
    expect(res.done).toBe(true);
  });

  it('adjusts a submission with reason and hours/minutes', async () => {
    const mockResponse = { data: { done: true, body: { id: 'appr-1', status: 'ADJUSTED' } } };
    (apiClient.post as any).mockResolvedValue(mockResponse);

    const payload = {
      approved_hours: 4,
      approved_minutes: 0,
      adjustment_reason: '1.5h exceeded scope',
    };
    const res = await timeApprovalsApiService.adjust('appr-1', payload);

    expect(apiClient.post).toHaveBeenCalledWith(
      expect.stringContaining('/time-approvals/appr-1/adjust'),
      payload
    );
    expect(res.done).toBe(true);
  });

  it('rejects a submission with mandatory rejection reason', async () => {
    const mockResponse = { data: { done: true, body: { id: 'appr-1', status: 'REJECTED' } } };
    (apiClient.post as any).mockResolvedValue(mockResponse);

    const payload = { rejection_reason: 'Please provide more details on work done' };
    const res = await timeApprovalsApiService.reject('appr-1', payload);

    expect(apiClient.post).toHaveBeenCalledWith(
      expect.stringContaining('/time-approvals/appr-1/reject'),
      payload
    );
    expect(res.done).toBe(true);
  });

  it('resubmits a rejected submission', async () => {
    const mockResponse = { data: { done: true, body: { id: 'appr-1', status: 'PENDING', version: 2 } } };
    (apiClient.post as any).mockResolvedValue(mockResponse);

    const res = await timeApprovalsApiService.resubmit('appr-1');
    expect(apiClient.post).toHaveBeenCalledWith(
      expect.stringContaining('/time-approvals/appr-1/resubmit')
    );
    expect(res.done).toBe(true);
  });

  it('fetches dashboard stats', async () => {
    const mockResponse = {
      data: {
        done: true,
        body: {
          pending_approvals_count: 5,
          approved_this_week_count: 12,
          adjusted_this_week_count: 2,
          rejected_this_week_count: 1,
        },
      },
    };
    (apiClient.get as any).mockResolvedValue(mockResponse);

    const res = await timeApprovalsApiService.getDashboardStats();
    expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('/time-approvals/dashboard-stats'));
    expect(res.body.pending_approvals_count).toBe(5);
  });
});

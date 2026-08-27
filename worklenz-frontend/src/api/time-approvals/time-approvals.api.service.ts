import { API_BASE_URL } from '@/shared/constants';
import apiClient from '../api-client';
import { IServerResponse } from '@/types/common.types';
import {
  ITaskTimeApproval,
  ITimeApprovalActionRequest,
  ITimesheetSummary,
  TaskTimeApprovalStatus,
} from '@/types/time-approval.types';

const rootUrl = `${API_BASE_URL}/time-approvals`;

export const timeApprovalsApiService = {
  submit: async (taskId: string): Promise<IServerResponse<ITaskTimeApproval>> => {
    const response = await apiClient.post(`${rootUrl}/submit/${taskId}`);
    return response.data;
  },

  getMySubmissions: async (): Promise<IServerResponse<ITaskTimeApproval[]>> => {
    const response = await apiClient.get(`${rootUrl}/my`);
    return response.data;
  },

  getPendingApprovals: async (params?: {
    status?: TaskTimeApprovalStatus | 'ALL';
    employee_id?: string;
    project_id?: string;
    start_date?: string;
    end_date?: string;
    over_estimate?: boolean;
    over_maximum?: boolean;
    search?: string;
  }): Promise<IServerResponse<ITaskTimeApproval[]>> => {
    const response = await apiClient.get(`${rootUrl}/pending`, { params });
    return response.data;
  },

  getById: async (id: string): Promise<IServerResponse<ITaskTimeApproval>> => {
    const response = await apiClient.get(`${rootUrl}/${id}`);
    return response.data;
  },

  getByTask: async (taskId: string): Promise<IServerResponse<ITaskTimeApproval[]>> => {
    const response = await apiClient.get(`${rootUrl}/task/${taskId}`);
    return response.data;
  },

  approve: async (id: string, body?: { manager_comment?: string }): Promise<IServerResponse<ITaskTimeApproval>> => {
    const response = await apiClient.post(`${rootUrl}/${id}/approve`, body || {});
    return response.data;
  },

  adjust: async (id: string, body: ITimeApprovalActionRequest): Promise<IServerResponse<ITaskTimeApproval>> => {
    const response = await apiClient.post(`${rootUrl}/${id}/adjust`, body);
    return response.data;
  },

  reject: async (id: string, body: { rejection_reason: string; manager_comment?: string }): Promise<IServerResponse<ITaskTimeApproval>> => {
    const response = await apiClient.post(`${rootUrl}/${id}/reject`, body);
    return response.data;
  },

  resubmit: async (id: string): Promise<IServerResponse<ITaskTimeApproval>> => {
    const response = await apiClient.post(`${rootUrl}/${id}/resubmit`);
    return response.data;
  },

  getTimesheetSummary: async (params?: {
    member_id?: string;
    start_date?: string;
    end_date?: string;
    scope?: 'my' | 'team';
  }): Promise<IServerResponse<ITimesheetSummary[]>> => {
    const response = await apiClient.get(`${rootUrl}/timesheet-summary`, { params });
    return response.data;
  },

  getMyTimesheet: async (params?: {
    start_date?: string;
    end_date?: string;
    view?: 'daily' | 'weekly' | 'monthly';
  }): Promise<IServerResponse<{
    summary: {
      total_recorded_seconds: number;
      total_approved_seconds: number;
      total_pending_seconds: number;
      total_adjustment_seconds: number;
    };
    days: Array<{
      date: string;
      recorded_seconds: number;
      approved_seconds: number;
      pending_seconds: number;
      adjustment_seconds: number;
      tasks: any[];
    }>;
  }>> => {
    const response = await apiClient.get(`${API_BASE_URL}/timesheets/my`, { params });
    return response.data;
  },

  getTeamTimesheet: async (params?: {
    employee_id?: string;
    project_id?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<IServerResponse<{
    summary: {
      total_recorded_seconds: number;
      total_approved_seconds: number;
      total_pending_seconds: number;
      total_adjustment_seconds: number;
      total_members_count: number;
      total_tasks_count: number;
    };
    members: any[];
  }>> => {
    const response = await apiClient.get(`${API_BASE_URL}/timesheets/team`, { params });
    return response.data;
  },

  getDashboardStats: async (): Promise<IServerResponse<import('@/types/time-approval.types').IManagerDashboardStats>> => {
    const response = await apiClient.get(`${rootUrl}/dashboard-stats`);
    return response.data;
  },
};



import { API_BASE_URL } from '@/shared/constants';
import { IServerResponse } from '@/types/common.types';
import apiClient from '../api-client';
import { JobRoleType } from '@/types/project/ratecard.types';

const rootUrl = `${API_BASE_URL}/project-finance`;

export interface IProjectRateCardRole {
  id?: string;
  project_id?: string;
  job_title_id: string;
  rate?: number | string;
  man_day_rate?: number | string;
  job_title_name?: string;
}

export const projectRateCardApiService = {
  getFromProjectId: async (projectId: string): Promise<IServerResponse<JobRoleType[]>> => {
    const response = await apiClient.get<IServerResponse<JobRoleType[]>>(
      `${rootUrl}/project/${projectId}/rate-card-roles`
    );
    return response.data;
  },

  getFromId: async (id: string): Promise<IServerResponse<IProjectRateCardRole>> => {
    const response = await apiClient.get<IServerResponse<IProjectRateCardRole>>(
      `${rootUrl}/rate-card-roles/${id}`
    );
    return response.data;
  },

  insertMany: async (
    projectId: string,
    roles: Omit<IProjectRateCardRole, 'id' | 'project_id'>[]
  ): Promise<IServerResponse<IProjectRateCardRole[]>> => {
    const response = await apiClient.post<IServerResponse<IProjectRateCardRole[]>>(
      `${rootUrl}/project/${projectId}/rate-card-roles`,
      { roles }
    );
    return response.data;
  },

  insertOne: async (body: {
    project_id: string;
    job_title_id: string;
    rate: number;
    man_day_rate?: number;
  }): Promise<IServerResponse<IProjectRateCardRole>> => {
    const response = await apiClient.post<IServerResponse<IProjectRateCardRole>>(
      `${rootUrl}/rate-card-roles`,
      body
    );
    return response.data;
  },

  updateFromId: async (
    id: string,
    body: { job_title_id: string; rate?: string; man_day_rate?: string }
  ): Promise<IServerResponse<IProjectRateCardRole>> => {
    const response = await apiClient.put<IServerResponse<IProjectRateCardRole>>(
      `${rootUrl}/rate-card-roles/${id}`,
      body
    );
    return response.data;
  },

  updateFromProjectId: async (
    projectId: string,
    roles: Omit<IProjectRateCardRole, 'id' | 'project_id'>[]
  ): Promise<IServerResponse<IProjectRateCardRole[]>> => {
    const response = await apiClient.put<IServerResponse<IProjectRateCardRole[]>>(
      `${rootUrl}/project/${projectId}/rate-card-roles`,
      { roles }
    );
    return response.data;
  },

  deleteFromId: async (id: string): Promise<IServerResponse<void>> => {
    const response = await apiClient.delete<IServerResponse<void>>(
      `${rootUrl}/rate-card-roles/${id}`
    );
    return response.data;
  },

  updateMemberRateCardRole: async (
    projectId: string,
    memberId: string,
    rateCardRoleId: string
  ): Promise<IServerResponse<void>> => {
    const response = await apiClient.put<IServerResponse<void>>(
      `${rootUrl}/project/${projectId}/members/${memberId}/rate-card-role`,
      { project_rate_card_role_id: rateCardRoleId }
    );
    return response.data;
  },

  deleteFromProjectId: async (projectId: string): Promise<IServerResponse<void>> => {
    const response = await apiClient.delete<IServerResponse<void>>(
      `${rootUrl}/project/${projectId}/rate-card-roles`
    );
    return response.data;
  },
};

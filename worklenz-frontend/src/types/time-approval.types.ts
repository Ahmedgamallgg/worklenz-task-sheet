export enum TaskTimeApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  ADJUSTED = 'ADJUSTED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum TopLevelApprovalPolicy {
  NO_APPROVAL_REQUIRED = 'NO_APPROVAL_REQUIRED',
  AUTO_APPROVE = 'AUTO_APPROVE',
  SPECIFIC_APPROVER = 'SPECIFIC_APPROVER',
}

export interface ITaskTimeApproval {
  id: string;
  task_id: string;
  team_member_id: string;
  submitted_by_member_id: string;
  approver_member_id?: string | null;
  recorded_duration: number; // in seconds
  approved_duration: number; // in seconds
  status: TaskTimeApprovalStatus;
  adjustment_reason?: string | null;
  rejection_reason?: string | null;
  manager_comment?: string | null;
  submission_number: number;
  version: number;
  submitted_at: string;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;

  // Joined presentation fields
  task_name?: string;
  task_no?: number;
  task_description?: string;
  task_estimated_minutes?: number;
  maximum_approved_minutes?: number | null;
  task_status_name?: string;
  task_status_color?: string;
  project_id?: string;
  project_name?: string;
  team_id?: string;
  team_name?: string;
  member_name?: string;
  member_email?: string;
  member_avatar_url?: string;
  approver_name?: string;
  approver_email?: string;
  variance_seconds?: number;
  variance_percentage?: number | null;
  time_logs?: {
    id: string;
    time_spent: number;
    description: string | null;
    created_at: string;
    logged_by_timer: boolean;
  }[];
  history?: ITaskTimeApproval[];
}

export interface ITimeApprovalActionRequest {
  approved_duration?: number;
  adjustment_reason?: string;
  rejection_reason?: string;
  manager_comment?: string;
}

export interface ITimesheetSummary {
  team_member_id: string;
  member_name: string;
  avatar_url?: string;
  email?: string;
  total_logged_seconds: number;
  total_approved_seconds: number;
  total_pending_seconds: number;
  total_adjusted_seconds: number;
  tasks_count: number;
}

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

export const TimeApprovalPolicy = TopLevelApprovalPolicy;
export type TimeApprovalPolicy = TopLevelApprovalPolicy;

export enum TimeApprovalErrorCodes {
  SELF_APPROVAL_NOT_ALLOWED = 'SELF_APPROVAL_NOT_ALLOWED',
  APPROVAL_ALREADY_REVIEWED = 'APPROVAL_ALREADY_REVIEWED',
  ADJUSTMENT_REASON_REQUIRED = 'ADJUSTMENT_REASON_REQUIRED',
  REJECTION_REASON_REQUIRED = 'REJECTION_REASON_REQUIRED',
  NOT_AUTHORIZED_TO_APPROVE = 'NOT_AUTHORIZED_TO_APPROVE',
  TIME_ALREADY_SUBMITTED = 'TIME_ALREADY_SUBMITTED',
  SUBMITTED_TIME_LOCKED = 'SUBMITTED_TIME_LOCKED',
  ACTIVE_TIMER_EXISTS = 'ACTIVE_TIMER_EXISTS',
  MAXIMUM_APPROVED_TIME_INVALID = 'MAXIMUM_APPROVED_TIME_INVALID',
  APPROVER_NOT_CONFIGURED = 'APPROVER_NOT_CONFIGURED',
  NO_RECORDED_TIME = 'NO_RECORDED_TIME',
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  MEMBER_NOT_FOUND = 'MEMBER_NOT_FOUND',
}

export interface ITaskTimeApproval {
  id?: string;
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
  submission_number?: number;
  version?: number;
  submitted_at?: string | Date;
  reviewed_at?: string | Date | null;
  created_at?: string | Date;
  updated_at?: string | Date;
  
  // Joined presentation fields
  task_name?: string;
  project_id?: string;
  project_name?: string;
  team_id?: string;
  team_name?: string;
  member_name?: string;
  member_email?: string;
  member_avatar_url?: string;
  approver_name?: string;
  approver_email?: string;
  task_estimated_minutes?: number;
  maximum_approved_minutes?: number | null;
  variance_seconds?: number;
  variance_percentage?: number;
}

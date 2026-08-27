import db from "../config/db";
import {
  ITaskTimeApproval,
  TaskTimeApprovalStatus,
  TimeApprovalErrorCodes,
  TopLevelApprovalPolicy,
} from "../interfaces/task-time-approval";
import { insertToActivityLogs } from "./activity-logs/activity-logs.service";
import { IActivityLogAttributeTypes, IActivityLogChangeType } from "./activity-logs/interfaces";
import { NotificationsService } from "./notifications/notifications.service";
import { IO } from "../shared/io";
import { SocketEvents } from "../socket.io/events";
import { IPassportSession } from "../interfaces/passport-session";
import { log_error, sanitizeCommentContent } from "../shared/utils";
import Excel from "exceljs";
import moment from "moment";

export interface IApprovalSubmitParams {
  taskId: string;
  user: IPassportSession;
  teamId: string;
}

export interface IApprovalReviewParams {
  approvalId: string;
  user: IPassportSession;
  teamId: string;
  managerComment?: string;
}

export interface IApprovalAdjustParams extends IApprovalReviewParams {
  approvedDuration: number;
  adjustmentReason: string;
}

export interface IApprovalRejectParams extends IApprovalReviewParams {
  rejectionReason: string;
}

export interface IApprovalFilterParams {
  teamId: string;
  userId: string;
  isAdmin?: boolean;
  employeeId?: string;
  projectId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  overEstimate?: boolean | string;
  overMaximum?: boolean | string;
  search?: string;
}

export interface IApprovalReportFilterParams {
  teamId: string;
  userId: string;
  isAdmin?: boolean;
  employeeId?: string;
  projectId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export class TaskTimeApprovalService {

  /**
   * Helper: Format seconds to standard duration string (e.g., "5h 30m", "4h", "45m")
   */
  public static formatDurationDisplay(seconds: number | string): string {
    const sec = typeof seconds === "string" ? parseFloat(seconds) : seconds;
    if (!sec || isNaN(sec) || sec <= 0) return "0m";
    const totalMinutes = Math.round(sec / 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
  }

  /**
   * Helper: Check if task time exceeds estimated time or maximum approved time, and notify manager if crossed
   */
  public static async checkTaskTimeThresholds(
    taskId: string,
    userId: string,
    addedSeconds: number,
    teamId?: string
  ): Promise<void> {
    if (!taskId || !userId) return;

    try {
      // 1. Get task info, estimated minutes, maximum approved minutes, and user's manager
      const taskQuery = `
        SELECT t.id, t.name, t.total_minutes, t.maximum_approved_minutes, t.project_id, p.team_id,
               tm.reports_to_member_id, u.name AS user_name
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        LEFT JOIN team_members tm ON tm.user_id = $2 AND tm.team_id = p.team_id
        LEFT JOIN users u ON u.id = $2
        WHERE t.id = $1;
      `;
      const taskRes = await db.query(taskQuery, [taskId, userId]);
      if (taskRes.rows.length === 0) return;
      const task = taskRes.rows[0];
      const effectiveTeamId = teamId || task.team_id;

      // 2. Get total recorded time on this task
      const totalTimeQuery = `
        SELECT COALESCE(SUM(time_spent), 0) AS total_seconds
        FROM task_work_log
        WHERE task_id = $1;
      `;
      const totalRes = await db.query(totalTimeQuery, [taskId]);
      const totalRecordedSeconds = parseFloat(totalRes.rows[0]?.total_seconds || "0");
      const totalBeforeSeconds = Math.max(0, totalRecordedSeconds - addedSeconds);

      // 3. Resolve manager recipient
      let managerUserId: string | null = null;
      if (task.reports_to_member_id) {
        const mgrRes = await db.query("SELECT user_id FROM team_members WHERE id = $1;", [task.reports_to_member_id]);
        managerUserId = mgrRes.rows[0]?.user_id || null;
      }

      if (!managerUserId && effectiveTeamId) {
        // Fall back to team admin / owner / manager
        const adminRes = await db.query(
          `SELECT tm.user_id
           FROM team_members tm
           JOIN roles r ON r.id = tm.role_id
           WHERE tm.team_id = $1 AND tm.active = TRUE AND tm.user_id != $2
             AND (r.admin_role = TRUE OR r.name IN ('Owner', 'Admin', 'Manager'))
           LIMIT 1;`,
          [effectiveTeamId, userId]
        );
        managerUserId = adminRes.rows[0]?.user_id || null;
      }

      if (!managerUserId) return;

      // 4. Check estimated time threshold (total_minutes)
      const estimatedSeconds = (parseFloat(task.total_minutes) || 0) * 60;
      if (estimatedSeconds > 0) {
        if (totalBeforeSeconds <= estimatedSeconds && totalRecordedSeconds > estimatedSeconds) {
          const trackedFormatted = TaskTimeApprovalService.formatDurationDisplay(totalRecordedSeconds);
          const estimateFormatted = TaskTimeApprovalService.formatDurationDisplay(estimatedSeconds);
          await NotificationsService.createNotification({
            userId: managerUserId,
            teamId: effectiveTeamId,
            taskId,
            projectId: task.project_id,
            message: `Task "${task.name}" has exceeded its estimated time (Tracked: ${trackedFormatted}, Estimated: ${estimateFormatted}).`,
          });
        }
      }

      // 5. Check maximum approved time threshold (maximum_approved_minutes)
      const maximumSeconds = (parseFloat(task.maximum_approved_minutes) || 0) * 60;
      if (maximumSeconds > 0) {
        if (totalBeforeSeconds <= maximumSeconds && totalRecordedSeconds > maximumSeconds) {
          const trackedFormatted = TaskTimeApprovalService.formatDurationDisplay(totalRecordedSeconds);
          const maxFormatted = TaskTimeApprovalService.formatDurationDisplay(maximumSeconds);
          await NotificationsService.createNotification({
            userId: managerUserId,
            teamId: effectiveTeamId,
            taskId,
            projectId: task.project_id,
            message: `Task "${task.name}" has exceeded maximum approved time (Tracked: ${trackedFormatted}, Maximum: ${maxFormatted}).`,
          });
        }
      }
    } catch (err) {
      log_error(err);
    }
  }

  /**
   * Helper: Validate adjustment reason requirement
   */
  public static validateAdjustmentReason(
    recordedDuration: number,
    approvedDuration: number,
    reason?: string | null
  ): { valid: boolean; code?: string; message?: string } {
    if (approvedDuration !== recordedDuration) {
      if (!reason || !reason.trim()) {
        return {
          valid: false,
          code: TimeApprovalErrorCodes.ADJUSTMENT_REASON_REQUIRED,
          message: "A reason is required when approved time differs from recorded time.",
        };
      }
    }
    return { valid: true };
  }

  /**
   * Helper: Validate rejection reason requirement
   */
  public static validateRejectionReason(
    reason?: string | null
  ): { valid: boolean; code?: string; message?: string } {
    if (!reason || !reason.trim()) {
      return {
        valid: false,
        code: TimeApprovalErrorCodes.REJECTION_REASON_REQUIRED,
        message: "A reason is required when rejecting a time submission.",
      };
    }
    return { valid: true };
  }

  /**
   * Helper: Check if submitter is self-approving
   */
  public static checkSelfApproval(
    submitterUserId: string,
    currentUserId: string
  ): { allowed: boolean; code?: string; message?: string } {
    if (submitterUserId === currentUserId) {
      return {
        allowed: false,
        code: TimeApprovalErrorCodes.SELF_APPROVAL_NOT_ALLOWED,
        message: "You cannot approve or review your own submitted work.",
      };
    }
    return { allowed: true };
  }

  /**
   * Resolve approver for a team member
   */
  public static async resolveApprover(teamMemberId: string, teamId: string): Promise<{
    approverMemberId: string | null;
    initialStatus: TaskTimeApprovalStatus;
    policy: string;
  }> {
    const memberQuery = `
      SELECT tm.reports_to_member_id, t.time_approval_policy
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.id = $1 AND tm.team_id = $2;
    `;
    const memberResult = await db.query(memberQuery, [teamMemberId, teamId]);
    if (memberResult.rows.length === 0) {
      return { approverMemberId: null, initialStatus: TaskTimeApprovalStatus.PENDING, policy: TopLevelApprovalPolicy.NO_APPROVAL_REQUIRED };
    }

    const { reports_to_member_id, time_approval_policy } = memberResult.rows[0];
    const policy = time_approval_policy || TopLevelApprovalPolicy.NO_APPROVAL_REQUIRED;

    if (reports_to_member_id) {
      return {
        approverMemberId: reports_to_member_id,
        initialStatus: TaskTimeApprovalStatus.PENDING,
        policy,
      };
    }

    // Top level manager (no reports_to_member_id)
    if (policy === TopLevelApprovalPolicy.AUTO_APPROVE || policy === TopLevelApprovalPolicy.NO_APPROVAL_REQUIRED) {
      return {
        approverMemberId: null,
        initialStatus: TaskTimeApprovalStatus.APPROVED,
        policy,
      };
    }

    return {
      approverMemberId: null,
      initialStatus: TaskTimeApprovalStatus.PENDING,
      policy,
    };
  }

  /**
   * Verify reviewer authorization to approve/adjust/reject a submission
   */
  public static async verifyReviewerAuthorization(
    reviewerUserId: string,
    teamId: string,
    submitterUserId: string,
    submitterMemberId: string,
    approverMemberId?: string | null,
    isAdminUser?: boolean
  ): Promise<{ authorized: boolean; reviewerMemberId?: string; error?: { code: string; message: string; status: number } }> {
    // 1. Self-approval rule
    const selfCheck = this.checkSelfApproval(submitterUserId, reviewerUserId);
    if (!selfCheck.allowed) {
      return {
        authorized: false,
        error: { code: selfCheck.code!, message: selfCheck.message!, status: 403 },
      };
    }

    // 2. Get reviewer's team member record
    const reviewerMemberQuery = `
      SELECT tm.id, r.name as role_name, r.admin_role
      FROM team_members tm
      JOIN roles r ON r.id = tm.role_id
      WHERE tm.user_id = $1 AND tm.team_id = $2 AND tm.active = TRUE;
    `;
    const reviewerMemberResult = await db.query(reviewerMemberQuery, [reviewerUserId, teamId]);
    if (reviewerMemberResult.rows.length === 0) {
      return {
        authorized: false,
        error: { code: TimeApprovalErrorCodes.MEMBER_NOT_FOUND, message: "Reviewer team member not found.", status: 403 },
      };
    }

    const reviewerMember = reviewerMemberResult.rows[0];
    const reviewerMemberId = reviewerMember.id;
    const isTeamAdmin = isAdminUser || reviewerMember.admin_role === true || reviewerMember.role_name === "Owner" || reviewerMember.role_name === "Admin";

    if (isTeamAdmin) {
      return { authorized: true, reviewerMemberId };
    }

    // 3. Check if reviewer is the designated approver
    if (approverMemberId && approverMemberId === reviewerMemberId) {
      return { authorized: true, reviewerMemberId };
    }

    // 4. Check if submitter reports directly to reviewer
    const directReportQuery = `
      SELECT id FROM team_members
      WHERE id = $1 AND reports_to_member_id = $2 AND team_id = $3;
    `;
    const directReportResult = await db.query(directReportQuery, [submitterMemberId, reviewerMemberId, teamId]);
    if (directReportResult.rows.length > 0) {
      return { authorized: true, reviewerMemberId };
    }

    // 5. Check if submitter is in reviewer's recursive subordinates (team_lead_managed_members view)
    try {
      const subordinateQuery = `
        SELECT managed_member_id FROM team_lead_managed_members
        WHERE manager_id = $1 AND managed_member_id = $2 AND team_id = $3;
      `;
      const subResult = await db.query(subordinateQuery, [reviewerMemberId, submitterMemberId, teamId]);
      if (subResult.rows.length > 0) {
        return { authorized: true, reviewerMemberId };
      }
    } catch {
      // If view is not queried or error occurs, fall through
    }

    return {
      authorized: false,
      error: {
        code: TimeApprovalErrorCodes.NOT_AUTHORIZED_TO_APPROVE,
        message: "You are not authorized to review this time submission.",
        status: 403,
      },
    };
  }

  /**
   * Submit time for a task
   */
  public static async submit(params: IApprovalSubmitParams): Promise<{ success: boolean; data?: any; error?: { code: string; message: string; status: number } }> {
    const { taskId, user, teamId } = params;
    const userId = user.id!;

    if (!taskId || !userId || !teamId) {
      return { success: false, error: { code: "BAD_REQUEST", message: "Task ID, user, and team are required.", status: 400 } };
    }

    // 1. Verify task belongs to user's team
    const taskQuery = `
      SELECT t.id, t.name, t.project_id, t.total_minutes, t.maximum_approved_minutes, p.team_id, p.name AS project_name
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.id = $1 AND p.team_id = $2;
    `;
    const taskResult = await db.query(taskQuery, [taskId, teamId]);
    if (taskResult.rows.length === 0) {
      return { success: false, error: { code: TimeApprovalErrorCodes.TASK_NOT_FOUND, message: "Task not found in the current team.", status: 404 } };
    }
    const task = taskResult.rows[0];

    // 2. Get submitter's team member record
    const memberQuery = `
      SELECT tm.id, tm.reports_to_member_id, tm.role_id, t.time_approval_policy
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = $1 AND tm.team_id = $2 AND tm.active = TRUE;
    `;
    const memberResult = await db.query(memberQuery, [userId, teamId]);
    if (memberResult.rows.length === 0) {
      return { success: false, error: { code: TimeApprovalErrorCodes.MEMBER_NOT_FOUND, message: "You are not a member of this team.", status: 403 } };
    }
    const member = memberResult.rows[0];
    const teamMemberId = member.id;

    // 3. Calculate total recorded duration from task_work_log
    const timeLogQuery = `
      SELECT COALESCE(SUM(time_spent), 0) AS total_seconds
      FROM task_work_log
      WHERE task_id = $1 AND user_id = $2;
    `;
    const timeLogResult = await db.query(timeLogQuery, [taskId, userId]);
    const recordedDuration = parseFloat(timeLogResult.rows[0]?.total_seconds || "0");

    if (recordedDuration <= 0) {
      return { success: false, error: { code: TimeApprovalErrorCodes.NO_RECORDED_TIME, message: "Cannot submit time approval with zero recorded hours.", status: 400 } };
    }

    // 4. Check for existing PENDING submission
    const existingPendingQuery = `
      SELECT id FROM task_time_approvals
      WHERE task_id = $1 AND team_member_id = $2 AND status = $3;
    `;
    const existingPending = await db.query(existingPendingQuery, [taskId, teamMemberId, TaskTimeApprovalStatus.PENDING]);
    if (existingPending.rows.length > 0) {
      return { success: false, error: { code: TimeApprovalErrorCodes.TIME_ALREADY_SUBMITTED, message: "A pending time approval submission already exists for this task.", status: 409 } };
    }

    // 5. Resolve approver and policy
    const { approverMemberId, initialStatus } = await this.resolveApprover(teamMemberId, teamId);
    const approvedDuration = initialStatus === TaskTimeApprovalStatus.APPROVED ? recordedDuration : 0;
    const reviewedAt = initialStatus === TaskTimeApprovalStatus.APPROVED ? new Date() : null;

    // 6. Get submission count
    const countQuery = `
      SELECT COUNT(*)::INT AS submission_count
      FROM task_time_approvals
      WHERE task_id = $1 AND team_member_id = $2;
    `;
    const countResult = await db.query(countQuery, [taskId, teamMemberId]);
    const submissionNumber = (countResult.rows[0]?.submission_count || 0) + 1;

    // 7. Insert approval record
    const insertQuery = `
      INSERT INTO task_time_approvals (
        task_id, team_member_id, submitted_by_member_id, approver_member_id,
        recorded_duration, approved_duration, status, submission_number, version,
        submitted_at, reviewed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $8, CURRENT_TIMESTAMP, $9
      )
      RETURNING *;
    `;
    const insertResult = await db.query(insertQuery, [
      taskId,
      teamMemberId,
      teamMemberId,
      approverMemberId,
      recordedDuration,
      approvedDuration,
      initialStatus,
      submissionNumber,
      reviewedAt,
    ]);
    const createdApproval = insertResult.rows[0];

    // 8. Log activity
    await insertToActivityLogs({
      task_id: taskId,
      team_id: teamId,
      project_id: task.project_id,
      user_id: userId,
      attribute_type: IActivityLogAttributeTypes.TIME_APPROVAL || "time_approval",
      log_type: IActivityLogChangeType.CREATE,
      next_string: `Submitted ${Math.round(recordedDuration / 60)} minutes for approval`,
    });

    // 9. Send notification to approver if designated
    if (approverMemberId) {
      const approverUserQuery = `SELECT user_id FROM team_members WHERE id = $1;`;
      const approverUserRes = await db.query(approverUserQuery, [approverMemberId]);
      const approverUserId = approverUserRes.rows[0]?.user_id;
      if (approverUserId && approverUserId !== userId) {
        await NotificationsService.createNotification({
          userId: approverUserId,
          teamId,
          taskId,
          projectId: task.project_id,
          message: `${user.name || "A team member"} submitted ${TaskTimeApprovalService.formatDurationDisplay(recordedDuration)} for approval on "${task.name}".`,
        });
      }
    }

    // 10. Emit socket event
    const io = IO.getInstance();
    if (io) {
      io.emit(SocketEvents.TASK_TIME_LOG_UPDATED.toString(), {
        task_id: taskId,
        approval_id: createdApproval.id,
        status: initialStatus,
      });
    }

    return { success: true, data: createdApproval };
  }

  /**
   * Approve a submission
   */
  public static async approve(params: IApprovalReviewParams): Promise<{ success: boolean; data?: any; error?: { code: string; message: string; status: number } }> {
    const { approvalId, user, teamId, managerComment } = params;
    const userId = user.id!;

    if (!approvalId || !userId || !teamId) {
      return { success: false, error: { code: "BAD_REQUEST", message: "Approval ID and user context are required.", status: 400 } };
    }

    // 1. Get approval record with tenant check
    const approvalQuery = `
      SELECT tta.*, tm.user_id AS submitter_user_id, t.name AS task_name, t.project_id, p.team_id
      FROM task_time_approvals tta
      JOIN team_members tm ON tm.id = tta.team_member_id
      JOIN tasks t ON t.id = tta.task_id
      JOIN projects p ON p.id = t.project_id
      WHERE tta.id = $1 AND p.team_id = $2;
    `;
    const approvalResult = await db.query(approvalQuery, [approvalId, teamId]);
    if (approvalResult.rows.length === 0) {
      return { success: false, error: { code: "NOT_FOUND", message: "Approval request not found.", status: 404 } };
    }
    const approval = approvalResult.rows[0];

    // 2. Authorization check
    const authCheck = await this.verifyReviewerAuthorization(
      userId,
      teamId,
      approval.submitter_user_id,
      approval.team_member_id,
      approval.approver_member_id,
      user.is_admin || user.owner
    );
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error };
    }

    if (approval.status !== TaskTimeApprovalStatus.PENDING) {
      return {
        success: false,
        error: {
          code: TimeApprovalErrorCodes.APPROVAL_ALREADY_REVIEWED,
          message: `This submission is already ${approval.status.toLowerCase()}.`,
          status: 400,
        },
      };
    }

    // 3. Update approval record
    const updateQuery = `
      UPDATE task_time_approvals
      SET status = $1,
          approved_duration = recorded_duration,
          approver_member_id = COALESCE(approver_member_id, $2),
          reviewed_at = CURRENT_TIMESTAMP,
          manager_comment = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *;
    `;
    const updateResult = await db.query(updateQuery, [
      TaskTimeApprovalStatus.APPROVED,
      authCheck.reviewerMemberId,
      managerComment || null,
      approvalId,
    ]);
    const updated = updateResult.rows[0];

    // 4. Activity log
    await insertToActivityLogs({
      task_id: approval.task_id,
      team_id: teamId,
      project_id: approval.project_id,
      user_id: userId,
      attribute_type: IActivityLogAttributeTypes.TIME_APPROVAL || "time_approval",
      log_type: IActivityLogChangeType.UPDATE,
      next_string: `Approved ${Math.round(approval.recorded_duration / 60)} minutes`,
    });

    // 5. Notification to submitter
    if (approval.submitter_user_id && approval.submitter_user_id !== userId) {
      await NotificationsService.createNotification({
        userId: approval.submitter_user_id,
        teamId,
        taskId: approval.task_id,
        projectId: approval.project_id,
        message: `Your submitted time (${TaskTimeApprovalService.formatDurationDisplay(approval.recorded_duration)}) for "${approval.task_name}" was approved.`,
      });
    }

    // 6. Socket emit
    const io = IO.getInstance();
    if (io) {
      io.emit(SocketEvents.TASK_TIME_LOG_UPDATED.toString(), {
        task_id: approval.task_id,
        approval_id: approvalId,
        status: TaskTimeApprovalStatus.APPROVED,
      });
    }

    return { success: true, data: updated };
  }

  /**
   * Adjust approved duration (recorded duration remains untouched)
   */
  public static async adjust(params: IApprovalAdjustParams): Promise<{ success: boolean; data?: any; error?: { code: string; message: string; status: number } }> {
    const { approvalId, user, teamId, approvedDuration, adjustmentReason, managerComment } = params;
    const userId = user.id!;

    if (!approvalId || !userId || !teamId || approvedDuration === undefined) {
      return { success: false, error: { code: "BAD_REQUEST", message: "Approval ID, user context, and approved duration are required.", status: 400 } };
    }

    const approvedSeconds = parseFloat(String(approvedDuration));
    if (isNaN(approvedSeconds) || approvedSeconds < 0) {
      return { success: false, error: { code: "BAD_REQUEST", message: "Invalid approved duration value.", status: 400 } };
    }

    // 1. Get approval record
    const approvalQuery = `
      SELECT tta.*, tm.user_id AS submitter_user_id, t.name AS task_name, t.project_id, p.team_id
      FROM task_time_approvals tta
      JOIN team_members tm ON tm.id = tta.team_member_id
      JOIN tasks t ON t.id = tta.task_id
      JOIN projects p ON p.id = t.project_id
      WHERE tta.id = $1 AND p.team_id = $2;
    `;
    const approvalResult = await db.query(approvalQuery, [approvalId, teamId]);
    if (approvalResult.rows.length === 0) {
      return { success: false, error: { code: "NOT_FOUND", message: "Approval request not found.", status: 404 } };
    }
    const approval = approvalResult.rows[0];

    // 2. Authorization check
    const authCheck = await this.verifyReviewerAuthorization(
      userId,
      teamId,
      approval.submitter_user_id,
      approval.team_member_id,
      approval.approver_member_id,
      user.is_admin || user.owner
    );
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error };
    }

    // 3. Validation: adjustment reason is mandatory when approved != recorded
    const recordedSeconds = parseFloat(approval.recorded_duration);
    const reasonValidation = this.validateAdjustmentReason(recordedSeconds, approvedSeconds, adjustmentReason);
    if (!reasonValidation.valid) {
      return { success: false, error: { code: reasonValidation.code!, message: reasonValidation.message!, status: 400 } };
    }

    // 4. Update task_time_approvals (CRITICAL: recorded_duration & task_work_log are NOT modified)
    const newStatus = approvedSeconds === recordedSeconds ? TaskTimeApprovalStatus.APPROVED : TaskTimeApprovalStatus.ADJUSTED;
    const updateQuery = `
      UPDATE task_time_approvals
      SET status = $1,
          approved_duration = $2,
          adjustment_reason = $3,
          manager_comment = $4,
          approver_member_id = COALESCE(approver_member_id, $5),
          reviewed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *;
    `;
    const updateResult = await db.query(updateQuery, [
      newStatus,
      approvedSeconds,
      adjustmentReason ? adjustmentReason.trim() : null,
      managerComment ? managerComment.trim() : null,
      authCheck.reviewerMemberId,
      approvalId,
    ]);
    const updated = updateResult.rows[0];

    // 5. Activity log
    await insertToActivityLogs({
      task_id: approval.task_id,
      team_id: teamId,
      project_id: approval.project_id,
      user_id: userId,
      attribute_type: IActivityLogAttributeTypes.TIME_APPROVAL || "time_approval",
      log_type: IActivityLogChangeType.UPDATE,
      next_string: `Adjusted approved time to ${Math.round(approvedSeconds / 60)} minutes (Recorded: ${Math.round(recordedSeconds / 60)}m). Reason: ${adjustmentReason || "N/A"}`,
    });

    // 6. Notification to submitter
    if (approval.submitter_user_id && approval.submitter_user_id !== userId) {
      await NotificationsService.createNotification({
        userId: approval.submitter_user_id,
        teamId,
        taskId: approval.task_id,
        projectId: approval.project_id,
        message: `Your submitted time for "${approval.task_name}" was adjusted from ${TaskTimeApprovalService.formatDurationDisplay(recordedSeconds)} to ${TaskTimeApprovalService.formatDurationDisplay(approvedSeconds)}. Reason: ${adjustmentReason}`,
      });
    }

    // 7. Socket emit
    const io = IO.getInstance();
    if (io) {
      io.emit(SocketEvents.TASK_TIME_LOG_UPDATED.toString(), {
        task_id: approval.task_id,
        approval_id: approvalId,
        status: newStatus,
      });
    }

    return { success: true, data: updated };
  }

  /**
   * Reject a submission
   */
  public static async reject(params: IApprovalRejectParams): Promise<{ success: boolean; data?: any; error?: { code: string; message: string; status: number } }> {
    const { approvalId, user, teamId, rejectionReason, managerComment } = params;
    const userId = user.id!;

    if (!approvalId || !userId || !teamId) {
      return { success: false, error: { code: "BAD_REQUEST", message: "Approval ID and user context are required.", status: 400 } };
    }

    // Validation: rejection reason is mandatory
    const reasonValidation = this.validateRejectionReason(rejectionReason);
    if (!reasonValidation.valid) {
      return { success: false, error: { code: reasonValidation.code!, message: reasonValidation.message!, status: 400 } };
    }

    // 1. Get approval record
    const approvalQuery = `
      SELECT tta.*, tm.user_id AS submitter_user_id, t.name AS task_name, t.project_id, p.team_id
      FROM task_time_approvals tta
      JOIN team_members tm ON tm.id = tta.team_member_id
      JOIN tasks t ON t.id = tta.task_id
      JOIN projects p ON p.id = t.project_id
      WHERE tta.id = $1 AND p.team_id = $2;
    `;
    const approvalResult = await db.query(approvalQuery, [approvalId, teamId]);
    if (approvalResult.rows.length === 0) {
      return { success: false, error: { code: "NOT_FOUND", message: "Approval request not found.", status: 404 } };
    }
    const approval = approvalResult.rows[0];

    // 2. Authorization check
    const authCheck = await this.verifyReviewerAuthorization(
      userId,
      teamId,
      approval.submitter_user_id,
      approval.team_member_id,
      approval.approver_member_id,
      user.is_admin || user.owner
    );
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error };
    }

    // 3. Update status to REJECTED
    const updateQuery = `
      UPDATE task_time_approvals
      SET status = $1,
          rejection_reason = $2,
          manager_comment = $3,
          approver_member_id = COALESCE(approver_member_id, $4),
          reviewed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *;
    `;
    const updateResult = await db.query(updateQuery, [
      TaskTimeApprovalStatus.REJECTED,
      rejectionReason.trim(),
      managerComment ? managerComment.trim() : null,
      authCheck.reviewerMemberId,
      approvalId,
    ]);
    const updated = updateResult.rows[0];

    // 4. Activity log
    await insertToActivityLogs({
      task_id: approval.task_id,
      team_id: teamId,
      project_id: approval.project_id,
      user_id: userId,
      attribute_type: IActivityLogAttributeTypes.TIME_APPROVAL || "time_approval",
      log_type: IActivityLogChangeType.UPDATE,
      next_string: `Rejected time submission. Reason: ${rejectionReason.trim()}`,
    });

    // 5. Notification to submitter
    if (approval.submitter_user_id && approval.submitter_user_id !== userId) {
      await NotificationsService.createNotification({
        userId: approval.submitter_user_id,
        teamId,
        taskId: approval.task_id,
        projectId: approval.project_id,
        message: `Your time submission for "${approval.task_name}" was rejected. Reason: ${rejectionReason.trim()}`,
      });
    }

    // 6. Socket emit
    const io = IO.getInstance();
    if (io) {
      io.emit(SocketEvents.TASK_TIME_LOG_UPDATED.toString(), {
        task_id: approval.task_id,
        approval_id: approvalId,
        status: TaskTimeApprovalStatus.REJECTED,
      });
    }

    return { success: true, data: updated };
  }

  /**
   * Resubmit a rejected submission
   */
  public static async resubmit(params: { approvalId: string; user: IPassportSession; teamId: string }): Promise<{ success: boolean; data?: any; error?: { code: string; message: string; status: number } }> {
    const { approvalId, user, teamId } = params;
    const userId = user.id!;

    if (!approvalId || !userId || !teamId) {
      return { success: false, error: { code: "BAD_REQUEST", message: "Approval ID and user context are required.", status: 400 } };
    }

    // 1. Get approval record
    const approvalQuery = `
      SELECT tta.*, tm.user_id AS submitter_user_id, t.name AS task_name, t.project_id, p.team_id
      FROM task_time_approvals tta
      JOIN team_members tm ON tm.id = tta.team_member_id
      JOIN tasks t ON t.id = tta.task_id
      JOIN projects p ON p.id = t.project_id
      WHERE tta.id = $1 AND p.team_id = $2;
    `;
    const approvalResult = await db.query(approvalQuery, [approvalId, teamId]);
    if (approvalResult.rows.length === 0) {
      return { success: false, error: { code: "NOT_FOUND", message: "Approval record not found.", status: 404 } };
    }
    const approval = approvalResult.rows[0];

    // Only submitter can resubmit
    if (approval.submitter_user_id !== userId) {
      return { success: false, error: { code: "FORBIDDEN", message: "Only the submitter can resubmit this time entry.", status: 403 } };
    }

    // 2. Recalculate recorded time from task_work_log
    const timeLogQuery = `
      SELECT COALESCE(SUM(time_spent), 0) AS total_seconds
      FROM task_work_log
      WHERE task_id = $1 AND user_id = $2;
    `;
    const timeLogResult = await db.query(timeLogQuery, [approval.task_id, userId]);
    const recordedDuration = parseFloat(timeLogResult.rows[0]?.total_seconds || "0");

    if (recordedDuration <= 0) {
      return { success: false, error: { code: TimeApprovalErrorCodes.NO_RECORDED_TIME, message: "Cannot resubmit with zero recorded hours.", status: 400 } };
    }

    // 3. Update approval record to PENDING with incremented version & submission number
    const updateQuery = `
      UPDATE task_time_approvals
      SET status = $1,
          recorded_duration = $2,
          approved_duration = 0,
          version = version + 1,
          submission_number = submission_number + 1,
          rejection_reason = NULL,
          adjustment_reason = NULL,
          manager_comment = NULL,
          submitted_at = CURRENT_TIMESTAMP,
          reviewed_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *;
    `;
    const updateResult = await db.query(updateQuery, [
      TaskTimeApprovalStatus.PENDING,
      recordedDuration,
      approvalId,
    ]);
    const updated = updateResult.rows[0];

    // 4. Activity log
    await insertToActivityLogs({
      task_id: approval.task_id,
      team_id: teamId,
      project_id: approval.project_id,
      user_id: userId,
      attribute_type: IActivityLogAttributeTypes.TIME_APPROVAL || "time_approval",
      log_type: IActivityLogChangeType.UPDATE,
      next_string: `Resubmitted ${Math.round(recordedDuration / 60)} minutes for approval (Submission #${updated.submission_number})`,
    });

    // 5. Notification to approver
    if (approval.approver_member_id) {
      const approverUserQuery = `SELECT user_id FROM team_members WHERE id = $1;`;
      const approverUserRes = await db.query(approverUserQuery, [approval.approver_member_id]);
      const approverUserId = approverUserRes.rows[0]?.user_id;
      if (approverUserId && approverUserId !== userId) {
        await NotificationsService.createNotification({
          userId: approverUserId,
          teamId,
          taskId: approval.task_id,
          projectId: approval.project_id,
          message: `${user.name || "A team member"} resubmitted ${TaskTimeApprovalService.formatDurationDisplay(recordedDuration)} for approval on "${approval.task_name}".`,
        });
      }
    }

    // 6. Socket emit
    const io = IO.getInstance();
    if (io) {
      io.emit(SocketEvents.TASK_TIME_LOG_UPDATED.toString(), {
        task_id: approval.task_id,
        approval_id: approvalId,
        status: TaskTimeApprovalStatus.PENDING,
      });
    }

    return { success: true, data: updated };
  }

  /**
   * Get pending submissions with manager hierarchy filters
   */
  public static async getPendingApprovals(params: IApprovalFilterParams): Promise<ITaskTimeApproval[]> {
    const { teamId, userId, isAdmin, employeeId, projectId, status = TaskTimeApprovalStatus.PENDING, startDate, endDate, overEstimate, overMaximum, search } = params;

    // Get current manager's team_member_id
    const memberQuery = `SELECT id FROM team_members WHERE user_id = $1 AND team_id = $2 AND active = TRUE;`;
    const memberResult = await db.query(memberQuery, [userId, teamId]);
    if (memberResult.rows.length === 0) {
      return [];
    }
    const currentMemberId = memberResult.rows[0].id;

    let query = `
      SELECT 
        tta.id,
        tta.task_id,
        tta.team_member_id,
        tta.submitted_by_member_id,
        tta.approver_member_id,
        tta.recorded_duration,
        tta.approved_duration,
        tta.status,
        tta.adjustment_reason,
        tta.rejection_reason,
        tta.manager_comment,
        tta.submission_number,
        tta.version,
        tta.submitted_at,
        tta.reviewed_at,
        t.name AS task_name,
        t.task_no,
        t.total_minutes AS task_estimated_minutes,
        t.maximum_approved_minutes,
        (SELECT name FROM task_statuses WHERE id = t.status_id) AS task_status_name,
        (SELECT color_code FROM sys_task_status_categories WHERE id = (SELECT category_id FROM task_statuses WHERE id = t.status_id)) AS task_status_color,
        p.id AS project_id,
        p.name AS project_name,
        u.name AS member_name,
        u.email AS member_email,
        u.avatar_url AS member_avatar_url,
        approver_u.name AS approver_name,
        (tta.recorded_duration - (t.total_minutes * 60)) AS variance_seconds,
        CASE 
          WHEN t.total_minutes > 0 THEN ROUND(((tta.recorded_duration - (t.total_minutes * 60)) / (t.total_minutes * 60) * 100)::numeric, 2)
          ELSE NULL 
        END AS variance_percentage
      FROM task_time_approvals tta
      JOIN tasks t ON t.id = tta.task_id
      JOIN projects p ON p.id = t.project_id
      JOIN team_members tm ON tm.id = tta.team_member_id
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN team_members approver_tm ON approver_tm.id = tta.approver_member_id
      LEFT JOIN users approver_u ON approver_u.id = approver_tm.user_id
      WHERE p.team_id = $1
    `;

    const queryParams: any[] = [teamId];
    let paramIndex = 2;

    if (status && status !== "ALL") {
      query += ` AND tta.status = $${paramIndex++}`;
      queryParams.push(status);
    }

    if (!isAdmin) {
      query += ` AND (
        tta.approver_member_id = $${paramIndex} 
        OR tm.reports_to_member_id = $${paramIndex}
        OR tm.id IN (SELECT managed_member_id FROM team_lead_managed_members WHERE manager_id = $${paramIndex})
      )`;
      queryParams.push(currentMemberId);
      paramIndex++;
    }

    if (employeeId) {
      query += ` AND tta.team_member_id = $${paramIndex++}`;
      queryParams.push(employeeId);
    }

    if (projectId) {
      query += ` AND t.project_id = $${paramIndex++}`;
      queryParams.push(projectId);
    }

    if (startDate && endDate) {
      query += ` AND tta.submitted_at >= $${paramIndex++} AND tta.submitted_at <= $${paramIndex++}`;
      queryParams.push(startDate, endDate);
    }

    if (overEstimate === true || overEstimate === "true") {
      query += ` AND (t.total_minutes > 0 AND tta.recorded_duration > (t.total_minutes * 60))`;
    }

    if (overMaximum === true || overMaximum === "true") {
      query += ` AND (t.maximum_approved_minutes IS NOT NULL AND t.maximum_approved_minutes > 0 AND tta.recorded_duration > (t.maximum_approved_minutes * 60))`;
    }

    if (search && typeof search === "string" && search.trim()) {
      const s = `%${search.trim()}%`;
      query += ` AND (t.name ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex} OR p.name ILIKE $${paramIndex})`;
      queryParams.push(s);
      paramIndex++;
    }

    query += ` ORDER BY tta.submitted_at DESC;`;

    const result = await db.query(query, queryParams);
    return result.rows;
  }

  /**
   * Get user's own submissions
   */
  public static async getMySubmissions(userId: string, teamId: string): Promise<ITaskTimeApproval[]> {
    const query = `
      SELECT 
        tta.id,
        tta.task_id,
        tta.team_member_id,
        tta.recorded_duration,
        tta.approved_duration,
        tta.status,
        tta.adjustment_reason,
        tta.rejection_reason,
        tta.manager_comment,
        tta.submission_number,
        tta.version,
        tta.submitted_at,
        tta.reviewed_at,
        t.name AS task_name,
        t.task_no,
        t.total_minutes AS task_estimated_minutes,
        t.maximum_approved_minutes,
        (SELECT name FROM task_statuses WHERE id = t.status_id) AS task_status_name,
        (SELECT color_code FROM sys_task_status_categories WHERE id = (SELECT category_id FROM task_statuses WHERE id = t.status_id)) AS task_status_color,
        p.id AS project_id,
        p.name AS project_name,
        approver_u.name AS approver_name
      FROM task_time_approvals tta
      JOIN tasks t ON t.id = tta.task_id
      JOIN projects p ON p.id = t.project_id
      JOIN team_members tm ON tm.id = tta.team_member_id
      LEFT JOIN team_members approver_tm ON approver_tm.id = tta.approver_member_id
      LEFT JOIN users approver_u ON approver_u.id = approver_tm.user_id
      WHERE tm.user_id = $1 AND p.team_id = $2
      ORDER BY tta.submitted_at DESC;
    `;
    const result = await db.query(query, [userId, teamId]);
    return result.rows;
  }

  /**
   * Get approval by ID with details and logs
   */
  public static async getById(approvalId: string, userId: string, teamId: string, isAdmin?: boolean): Promise<{ success: boolean; data?: any; error?: { code: string; message: string; status: number } }> {
    const query = `
      SELECT 
        tta.*,
        t.name AS task_name,
        t.task_no,
        t.description AS task_description,
        t.total_minutes AS task_estimated_minutes,
        t.maximum_approved_minutes,
        (SELECT name FROM task_statuses WHERE id = t.status_id) AS task_status_name,
        (SELECT color_code FROM sys_task_status_categories WHERE id = (SELECT category_id FROM task_statuses WHERE id = t.status_id)) AS task_status_color,
        p.id AS project_id,
        p.name AS project_name,
        u.name AS member_name,
        u.email AS member_email,
        u.avatar_url AS member_avatar_url,
        tm.user_id AS submitter_user_id,
        approver_u.name AS approver_name,
        approver_u.email AS approver_email,
        (tta.recorded_duration - (t.total_minutes * 60)) AS variance_seconds,
        CASE 
          WHEN t.total_minutes > 0 THEN ROUND(((tta.recorded_duration - (t.total_minutes * 60)) / (t.total_minutes * 60) * 100)::numeric, 2)
          ELSE NULL 
        END AS variance_percentage
      FROM task_time_approvals tta
      JOIN tasks t ON t.id = tta.task_id
      JOIN projects p ON p.id = t.project_id
      JOIN team_members tm ON tm.id = tta.team_member_id
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN team_members approver_tm ON approver_tm.id = tta.approver_member_id
      LEFT JOIN users approver_u ON approver_u.id = approver_tm.user_id
      WHERE tta.id = $1 AND p.team_id = $2;
    `;
    const result = await db.query(query, [approvalId, teamId]);
    if (result.rows.length === 0) {
      return { success: false, error: { code: "NOT_FOUND", message: "Approval record not found.", status: 404 } };
    }

    const approval = result.rows[0];

    // Authorization check
    const currentMemberQuery = `SELECT id FROM team_members WHERE user_id = $1 AND team_id = $2;`;
    const currentMemberRes = await db.query(currentMemberQuery, [userId, teamId]);
    const currentMemberId = currentMemberRes.rows[0]?.id;

    const isSubmitter = approval.submitter_user_id === userId;
    const isApprover = approval.approver_member_id === currentMemberId;

    if (!isAdmin && !isSubmitter && !isApprover) {
      // Check reporting line
      const lineCheckQuery = `
        SELECT id FROM team_members 
        WHERE id = $1 AND (reports_to_member_id = $2 OR id IN (SELECT managed_member_id FROM team_lead_managed_members WHERE manager_id = $2));
      `;
      const lineCheck = await db.query(lineCheckQuery, [approval.team_member_id, currentMemberId]);
      if (lineCheck.rows.length === 0) {
        return { success: false, error: { code: TimeApprovalErrorCodes.NOT_AUTHORIZED_TO_APPROVE, message: "You are not authorized to view this approval record.", status: 403 } };
      }
    }

    // Get time logs
    const logsQuery = `
      SELECT id, time_spent, description, created_at, logged_by_timer
      FROM task_work_log
      WHERE task_id = $1 AND user_id = (SELECT user_id FROM team_members WHERE id = $2)
      ORDER BY created_at ASC;
    `;
    const logsResult = await db.query(logsQuery, [approval.task_id, approval.team_member_id]);
    approval.time_logs = logsResult.rows;

    // Get submission history
    const historyQuery = `
      SELECT id, submission_number, version, recorded_duration, approved_duration, status,
             adjustment_reason, rejection_reason, manager_comment, submitted_at, reviewed_at
      FROM task_time_approvals
      WHERE task_id = $1 AND team_member_id = $2
      ORDER BY submission_number DESC;
    `;
    const historyResult = await db.query(historyQuery, [approval.task_id, approval.team_member_id]);
    approval.history = historyResult.rows;

    return { success: true, data: approval };
  }

  /**
   * Get approval list by task
   */
  public static async getByTask(taskId: string, teamId: string): Promise<ITaskTimeApproval[]> {
    const query = `
      SELECT 
        tta.id,
        tta.task_id,
        tta.team_member_id,
        tta.recorded_duration,
        tta.approved_duration,
        tta.status,
        tta.adjustment_reason,
        tta.rejection_reason,
        tta.manager_comment,
        tta.submission_number,
        tta.version,
        tta.submitted_at,
        tta.reviewed_at,
        u.name AS member_name,
        u.avatar_url AS member_avatar_url,
        approver_u.name AS approver_name
      FROM task_time_approvals tta
      JOIN team_members tm ON tm.id = tta.team_member_id
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN team_members approver_tm ON approver_tm.id = tta.approver_member_id
      LEFT JOIN users approver_u ON approver_u.id = approver_tm.user_id
      JOIN tasks t ON t.id = tta.task_id
      JOIN projects p ON p.id = t.project_id
      WHERE tta.task_id = $1 AND p.team_id = $2
      ORDER BY tta.submitted_at DESC;
    `;
    const result = await db.query(query, [taskId, teamId]);
    return result.rows;
  }

  /**
   * Get timesheet summary (Recorded, Approved, Pending, Adjusted)
   */
  public static async getTimesheetSummary(params: {
    teamId: string;
    userId: string;
    targetMemberId?: string;
    scope?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<any[]> {
    const { teamId, targetMemberId, scope = "my", startDate, endDate } = params;

    let dateFilter = "";
    const queryParams: any[] = [teamId];
    let paramIndex = 2;

    if (startDate && endDate) {
      dateFilter = ` AND twl.created_at >= $${paramIndex++} AND twl.created_at <= $${paramIndex++}`;
      queryParams.push(startDate, endDate);
    }

    let memberFilter = "";
    if (scope === "my" || (scope === "team" && targetMemberId)) {
      memberFilter = ` AND tm.id = $${paramIndex++}`;
      queryParams.push(targetMemberId);
    }

    const query = `
      SELECT 
        tm.id AS team_member_id,
        u.name AS member_name,
        u.email AS member_email,
        u.avatar_url AS member_avatar_url,
        COALESCE(SUM(twl.time_spent), 0) AS total_recorded_seconds,
        COALESCE(SUM(CASE WHEN tta.status IN ('APPROVED', 'ADJUSTED') THEN tta.approved_duration ELSE 0 END), 0) AS total_approved_seconds,
        COALESCE(SUM(CASE WHEN tta.status = 'PENDING' THEN tta.recorded_duration ELSE 0 END), 0) AS total_pending_seconds,
        COALESCE(SUM(CASE WHEN tta.status = 'ADJUSTED' THEN (tta.approved_duration - tta.recorded_duration) ELSE 0 END), 0) AS total_adjustment_seconds
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN task_work_log twl ON twl.user_id = u.id ${dateFilter}
      LEFT JOIN tasks t ON t.id = twl.task_id
      LEFT JOIN projects p ON p.id = t.project_id AND p.team_id = $1
      LEFT JOIN task_time_approvals tta ON tta.task_id = t.id AND tta.team_member_id = tm.id
      WHERE tm.team_id = $1 ${memberFilter}
      GROUP BY tm.id, u.name, u.email, u.avatar_url;
    `;

    const result = await db.query(query, queryParams);
    return result.rows;
  }

  /**
   * Get employee detailed timesheet with daily/weekly breakdown and task details
   */
  public static async getMyTimesheet(params: {
    userId: string;
    teamId: string;
    startDate?: string;
    endDate?: string;
    view?: string;
  }): Promise<{
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
  }> {
    const { userId, teamId, startDate, endDate } = params;

    // Get current member id
    const memberRes = await db.query(
      `SELECT id FROM team_members WHERE user_id = $1 AND team_id = $2;`,
      [userId, teamId]
    );
    const memberId = memberRes.rows[0]?.id;

    if (!memberId) {
      return {
        summary: {
          total_recorded_seconds: 0,
          total_approved_seconds: 0,
          total_pending_seconds: 0,
          total_adjustment_seconds: 0,
        },
        days: [],
      };
    }

    let dateFilter = "";
    const queryParams: any[] = [userId, teamId, memberId];
    let paramIndex = 4;

    if (startDate && endDate) {
      dateFilter = ` AND twl.created_at >= $${paramIndex++} AND twl.created_at <= $${paramIndex++}`;
      queryParams.push(startDate, endDate);
    }

    const query = `
      SELECT 
        TO_CHAR(twl.created_at, 'YYYY-MM-DD') AS log_date,
        t.id AS task_id,
        t.name AS task_name,
        t.task_no,
        p.id AS project_id,
        p.name AS project_name,
        SUM(twl.time_spent) AS recorded_seconds,
        COALESCE(tta.status, 'NOT_SUBMITTED') AS approval_status,
        COALESCE(tta.approved_duration, 0) AS approved_seconds,
        tta.adjustment_reason,
        tta.rejection_reason,
        tta.manager_comment,
        COUNT(twl.id) AS logs_count
      FROM task_work_log twl
      JOIN tasks t ON t.id = twl.task_id
      JOIN projects p ON p.id = t.project_id AND p.team_id = $2
      LEFT JOIN task_time_approvals tta ON tta.task_id = t.id AND tta.team_member_id = $3
      WHERE twl.user_id = $1 ${dateFilter}
      GROUP BY 
        TO_CHAR(twl.created_at, 'YYYY-MM-DD'),
        t.id, t.name, t.task_no, p.id, p.name,
        tta.status, tta.approved_duration, tta.adjustment_reason, tta.rejection_reason, tta.manager_comment
      ORDER BY log_date DESC, t.name ASC;
    `;

    const result = await db.query(query, queryParams);
    const rows = result.rows;

    let totalRecorded = 0;
    let totalApproved = 0;
    let totalPending = 0;
    let totalAdjustment = 0;

    const daysMap = new Map<string, {
      date: string;
      recorded_seconds: number;
      approved_seconds: number;
      pending_seconds: number;
      adjustment_seconds: number;
      tasks: any[];
    }>();

    for (const row of rows) {
      const recSec = parseInt(row.recorded_seconds, 10) || 0;
      const appSec = (row.approval_status === "APPROVED" || row.approval_status === "ADJUSTED")
        ? (parseInt(row.approved_seconds, 10) || 0)
        : 0;
      const pendSec = row.approval_status === "PENDING" ? recSec : 0;
      const adjSec = row.approval_status === "ADJUSTED" ? (appSec - recSec) : 0;

      totalRecorded += recSec;
      totalApproved += appSec;
      totalPending += pendSec;
      totalAdjustment += adjSec;

      if (!daysMap.has(row.log_date)) {
        daysMap.set(row.log_date, {
          date: row.log_date,
          recorded_seconds: 0,
          approved_seconds: 0,
          pending_seconds: 0,
          adjustment_seconds: 0,
          tasks: [],
        });
      }

      const dayGroup = daysMap.get(row.log_date)!;
      dayGroup.recorded_seconds += recSec;
      dayGroup.approved_seconds += appSec;
      dayGroup.pending_seconds += pendSec;
      dayGroup.adjustment_seconds += adjSec;
      dayGroup.tasks.push({
        task_id: row.task_id,
        task_name: row.task_name,
        task_no: row.task_no,
        project_id: row.project_id,
        project_name: row.project_name,
        recorded_seconds: recSec,
        approved_seconds: appSec,
        status: row.approval_status,
        adjustment_reason: row.adjustment_reason,
        rejection_reason: row.rejection_reason,
        manager_comment: row.manager_comment,
        logs_count: parseInt(row.logs_count, 10) || 1,
      });
    }

    return {
      summary: {
        total_recorded_seconds: totalRecorded,
        total_approved_seconds: totalApproved,
        total_pending_seconds: totalPending,
        total_adjustment_seconds: totalAdjustment,
      },
      days: Array.from(daysMap.values()),
    };
  }

  /**
   * Get team timesheet with member breakdowns and tasks for managers/leads
   */
  public static async getTeamTimesheet(params: {
    teamId: string;
    userId: string;
    isAdmin?: boolean;
    employeeId?: string;
    projectId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{
    summary: {
      total_recorded_seconds: number;
      total_approved_seconds: number;
      total_pending_seconds: number;
      total_adjustment_seconds: number;
      total_members_count: number;
      total_tasks_count: number;
    };
    members: any[];
  }> {
    const { teamId, userId, isAdmin, employeeId, projectId, status, startDate, endDate } = params;

    let memberFilter = "";
    const queryParams: any[] = [teamId];
    let paramIndex = 2;

    if (!isAdmin) {
      memberFilter = `
        AND (
          tm.reports_to_member_id IN (SELECT id FROM team_members WHERE user_id = $${paramIndex++} AND team_id = $1)
          OR tm.id IN (SELECT id FROM team_members WHERE user_id = $${paramIndex - 1} AND team_id = $1)
        )
      `;
      queryParams.push(userId);
    }

    if (employeeId) {
      memberFilter += ` AND (tm.id = $${paramIndex} OR tm.user_id = $${paramIndex++})`;
      queryParams.push(employeeId);
    }

    let projectFilter = "";
    if (projectId) {
      projectFilter = ` AND p.id = $${paramIndex++}`;
      queryParams.push(projectId);
    }

    let dateFilter = "";
    if (startDate && endDate) {
      dateFilter = ` AND twl.created_at >= $${paramIndex++} AND twl.created_at <= $${paramIndex++}`;
      queryParams.push(startDate, endDate);
    }

    let statusFilter = "";
    if (status && status !== "ALL") {
      statusFilter = ` AND tta.status = $${paramIndex++}`;
      queryParams.push(status);
    }

    const query = `
      SELECT 
        tm.id AS team_member_id,
        u.id AS user_id,
        u.name AS member_name,
        u.email AS member_email,
        u.avatar_url AS member_avatar_url,
        r.name AS role_name,
        COALESCE(SUM(twl.time_spent), 0) AS recorded_seconds,
        COALESCE(SUM(CASE WHEN tta.status IN ('APPROVED', 'ADJUSTED') THEN tta.approved_duration ELSE 0 END), 0) AS approved_seconds,
        COALESCE(SUM(CASE WHEN tta.status = 'PENDING' THEN tta.recorded_duration ELSE 0 END), 0) AS pending_seconds,
        COALESCE(SUM(CASE WHEN tta.status = 'ADJUSTED' THEN (tta.approved_duration - tta.recorded_duration) ELSE 0 END), 0) AS adjustment_seconds,
        COUNT(DISTINCT t.id) AS tasks_count
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN roles r ON r.id = tm.role_id
      LEFT JOIN task_work_log twl ON twl.user_id = u.id ${dateFilter}
      LEFT JOIN tasks t ON t.id = twl.task_id
      LEFT JOIN projects p ON p.id = t.project_id AND p.team_id = $1 ${projectFilter}
      LEFT JOIN task_time_approvals tta ON tta.task_id = t.id AND tta.team_member_id = tm.id ${statusFilter}
      WHERE tm.team_id = $1 AND tm.active = TRUE ${memberFilter}
      GROUP BY tm.id, u.id, u.name, u.email, u.avatar_url, r.name
      ORDER BY u.name ASC;
    `;

    const result = await db.query(query, queryParams);
    const members = result.rows.map((row: any) => ({
      team_member_id: row.team_member_id,
      user_id: row.user_id,
      name: row.member_name,
      email: row.member_email,
      avatar_url: row.member_avatar_url,
      role_name: row.role_name,
      tasks_count: parseInt(row.tasks_count, 10) || 0,
      recorded_seconds: parseInt(row.recorded_seconds, 10) || 0,
      approved_seconds: parseInt(row.approved_seconds, 10) || 0,
      pending_seconds: parseInt(row.pending_seconds, 10) || 0,
      adjustment_seconds: parseInt(row.adjustment_seconds, 10) || 0,
    }));

    let totalRecorded = 0;
    let totalApproved = 0;
    let totalPending = 0;
    let totalAdjustment = 0;
    let totalTasks = 0;

    for (const m of members) {
      totalRecorded += m.recorded_seconds;
      totalApproved += m.approved_seconds;
      totalPending += m.pending_seconds;
      totalAdjustment += m.adjustment_seconds;
      totalTasks += m.tasks_count;
    }

    return {
      summary: {
        total_recorded_seconds: totalRecorded,
        total_approved_seconds: totalApproved,
        total_pending_seconds: totalPending,
        total_adjustment_seconds: totalAdjustment,
        total_members_count: members.length,
        total_tasks_count: totalTasks,
      },
      members,
    };
  }

  /**
   * Get Manager and Employee Dashboard statistics (MY WORK & MY TEAM)
   */
  public static async getDashboardStats(params: {
    userId: string;
    teamId: string;
    isAdmin?: boolean;
  }): Promise<{
    my_work: {
      tasks_count: number;
      tasks_today_count: number;
      tasks_completed_today_count: number;
      recorded_today_seconds: number;
      approved_today_seconds: number;
      pending_submissions_count: number;
      pending_submissions_seconds: number;
      recent_submissions: any[];
    };
    my_team: {
      is_manager: boolean;
      employees_count: number;
      tasks_in_progress_count: number;
      pending_approvals_count: number;
      pending_time_seconds: number;
      overdue_tasks_count: number;
      recorded_today_seconds: number;
      approved_today_seconds: number;
      team_members_summary: any[];
      recent_pending_approvals: any[];
    };
  }> {
    const { userId, teamId, isAdmin } = params;

    // 1. Get current member info
    const currentMemberRes = await db.query(
      `SELECT tm.id, tm.role_id, r.name AS role_name
       FROM team_members tm
       LEFT JOIN roles r ON r.id = tm.role_id
       WHERE tm.user_id = $1 AND tm.team_id = $2 AND tm.active = TRUE;`,
      [userId, teamId]
    );

    const currentMember = currentMemberRes.rows[0];
    const currentMemberId = currentMember?.id;
    const isTeamLead = currentMember?.role_name?.toLowerCase().includes("team lead") || currentMember?.role_name?.toLowerCase().includes("lead");

    // 2. MY WORK STATS
    let myTasksCount = 0;
    let myTasksTodayCount = 0;
    let myTasksCompletedToday = 0;

    if (currentMemberId) {
      const activeTasksRes = await db.query(
        `SELECT COUNT(DISTINCT t.id) AS active_tasks_count,
                COUNT(DISTINCT CASE WHEN t.end_date::DATE = CURRENT_DATE::DATE THEN t.id END) AS today_tasks_count
         FROM tasks t
         JOIN tasks_assignees ta ON ta.task_id = t.id AND ta.team_member_id = $1
         JOIN projects p ON p.id = t.project_id AND p.team_id = $2
         WHERE t.archived IS FALSE
           AND t.status_id NOT IN (
             SELECT id FROM task_statuses WHERE category_id IN (
               SELECT id FROM sys_task_status_categories WHERE is_done IS TRUE
             )
           );`,
        [currentMemberId, teamId]
      );
      myTasksCount = parseInt(activeTasksRes.rows[0]?.active_tasks_count, 10) || 0;
      myTasksTodayCount = parseInt(activeTasksRes.rows[0]?.today_tasks_count, 10) || 0;

      const completedTodayRes = await db.query(
        `SELECT COUNT(DISTINCT t.id) AS completed_today_count
         FROM tasks t
         JOIN tasks_assignees ta ON ta.task_id = t.id AND ta.team_member_id = $1
         JOIN projects p ON p.id = t.project_id AND p.team_id = $2
         WHERE t.archived IS FALSE
           AND t.updated_at::DATE = CURRENT_DATE::DATE
           AND t.status_id IN (
             SELECT id FROM task_statuses WHERE category_id IN (
               SELECT id FROM sys_task_status_categories WHERE is_done IS TRUE
             )
           );`,
        [currentMemberId, teamId]
      );
      myTasksCompletedToday = parseInt(completedTodayRes.rows[0]?.completed_today_count, 10) || 0;
    }

    // Recorded today by user
    const recordedTodayRes = await db.query(
      `SELECT COALESCE(SUM(time_spent), 0) AS recorded_seconds
       FROM task_work_log
       WHERE user_id = $1 AND team_id = $2 AND created_at::DATE = CURRENT_DATE::DATE;`,
      [userId, teamId]
    );
    const recordedTodaySeconds = parseInt(recordedTodayRes.rows[0]?.recorded_seconds, 10) || 0;

    // Approved today for user
    let approvedTodaySeconds = 0;
    let pendingSubmissionsCount = 0;
    let pendingSubmissionsSeconds = 0;
    let recentSubmissions: any[] = [];

    if (currentMemberId) {
      const approvalStatsRes = await db.query(
        `SELECT
           COALESCE(SUM(CASE WHEN status IN ('APPROVED', 'ADJUSTED') AND reviewed_at::DATE = CURRENT_DATE::DATE THEN approved_duration ELSE 0 END), 0) AS approved_today_seconds,
           COUNT(CASE WHEN status = 'PENDING' THEN 1 END) AS pending_count,
           COALESCE(SUM(CASE WHEN status = 'PENDING' THEN recorded_duration ELSE 0 END), 0) AS pending_seconds
         FROM task_time_approvals
         WHERE team_member_id = $1 AND team_id = $2;`,
        [currentMemberId, teamId]
      );

      approvedTodaySeconds = parseInt(approvalStatsRes.rows[0]?.approved_today_seconds, 10) || 0;
      pendingSubmissionsCount = parseInt(approvalStatsRes.rows[0]?.pending_count, 10) || 0;
      pendingSubmissionsSeconds = parseInt(approvalStatsRes.rows[0]?.pending_seconds, 10) || 0;

      const mySubmissions = await this.getMySubmissions(userId, teamId);
      recentSubmissions = mySubmissions.slice(0, 5);
    }

    // 3. MY TEAM STATS
    let isManager = !!isAdmin || !!isTeamLead;
    let subordinateMemberIds: string[] = [];

    if (isAdmin) {
      const allMembersRes = await db.query(
        `SELECT id FROM team_members WHERE team_id = $1 AND active = TRUE AND id != COALESCE($2, '00000000-0000-0000-0000-000000000000'::UUID);`,
        [teamId, currentMemberId]
      );
      subordinateMemberIds = allMembersRes.rows.map((r: any) => r.id);
      if (subordinateMemberIds.length > 0) {
        isManager = true;
      }
    } else if (currentMemberId) {
      const subMembersRes = await db.query(
        `SELECT tm.id
         FROM team_members tm
         WHERE tm.team_id = $1 AND tm.active = TRUE
           AND (tm.reports_to_member_id = $2 OR tm.id IN (
             SELECT managed_member_id FROM team_lead_managed_members WHERE manager_id = $2
           ));`,
        [teamId, currentMemberId]
      );
      subordinateMemberIds = subMembersRes.rows.map((r: any) => r.id);
      if (subordinateMemberIds.length > 0) {
        isManager = true;
      }
    }

    let teamEmployeesCount = subordinateMemberIds.length;
    let teamTasksInProgressCount = 0;
    let teamPendingApprovalsCount = 0;
    let teamPendingTimeSeconds = 0;
    let teamOverdueTasksCount = 0;
    let teamRecordedTodaySeconds = 0;
    let teamApprovedTodaySeconds = 0;
    let teamMembersSummary: any[] = [];
    let recentPendingApprovals: any[] = [];

    if (isManager && subordinateMemberIds.length > 0) {
      // Team tasks in progress & overdue
      const teamTasksRes = await db.query(
        `SELECT COUNT(DISTINCT t.id) AS in_progress_count,
                COUNT(DISTINCT CASE WHEN t.end_date::DATE < CURRENT_DATE::DATE THEN t.id END) AS overdue_count
         FROM tasks t
         JOIN tasks_assignees ta ON ta.task_id = t.id AND ta.team_member_id = ANY($1::UUID[])
         JOIN projects p ON p.id = t.project_id AND p.team_id = $2
         WHERE t.archived IS FALSE
           AND t.status_id NOT IN (
             SELECT id FROM task_statuses WHERE category_id IN (
               SELECT id FROM sys_task_status_categories WHERE is_done IS TRUE
             )
           );`,
        [subordinateMemberIds, teamId]
      );

      teamTasksInProgressCount = parseInt(teamTasksRes.rows[0]?.in_progress_count, 10) || 0;
      teamOverdueTasksCount = parseInt(teamTasksRes.rows[0]?.overdue_count, 10) || 0;

      // Team pending approvals
      let pendingQuery = `
        SELECT COUNT(*) AS pending_count,
               COALESCE(SUM(recorded_duration), 0) AS pending_seconds
        FROM task_time_approvals tta
        WHERE tta.team_id = $1 AND tta.status = 'PENDING'
      `;
      const pendingQueryParams: any[] = [teamId];

      if (!isAdmin && currentMemberId) {
        pendingQuery += ` AND (tta.approver_member_id = $2 OR tta.team_member_id = ANY($3::UUID[]))`;
        pendingQueryParams.push(currentMemberId, subordinateMemberIds);
      } else {
        pendingQuery += ` AND tta.team_member_id = ANY($2::UUID[])`;
        pendingQueryParams.push(subordinateMemberIds);
      }

      const teamPendingRes = await db.query(pendingQuery, pendingQueryParams);
      teamPendingApprovalsCount = parseInt(teamPendingRes.rows[0]?.pending_count, 10) || 0;
      teamPendingTimeSeconds = parseInt(teamPendingRes.rows[0]?.pending_seconds, 10) || 0;

      // Team recorded today
      const teamRecordedRes = await db.query(
        `SELECT COALESCE(SUM(twl.time_spent), 0) AS recorded_today_seconds
         FROM task_work_log twl
         JOIN team_members tm ON tm.user_id = twl.user_id AND tm.team_id = $1
         WHERE tm.id = ANY($2::UUID[])
           AND twl.created_at::DATE = CURRENT_DATE::DATE;`,
        [teamId, subordinateMemberIds]
      );
      teamRecordedTodaySeconds = parseInt(teamRecordedRes.rows[0]?.recorded_today_seconds, 10) || 0;

      // Team approved today
      const teamApprovedRes = await db.query(
        `SELECT COALESCE(SUM(tta.approved_duration), 0) AS approved_today_seconds
         FROM task_time_approvals tta
         WHERE tta.team_id = $1
           AND tta.team_member_id = ANY($2::UUID[])
           AND tta.status IN ('APPROVED', 'ADJUSTED')
           AND tta.reviewed_at::DATE = CURRENT_DATE::DATE;`,
        [teamId, subordinateMemberIds]
      );
      teamApprovedTodaySeconds = parseInt(teamApprovedRes.rows[0]?.approved_today_seconds, 10) || 0;

      // Team members individual breakdown summary
      const summaryRes = await db.query(
        `SELECT tm.id AS team_member_id,
                u.id AS user_id,
                u.name AS member_name,
                u.email AS member_email,
                u.avatar_url AS member_avatar_url,
                r.name AS role_name,
                (SELECT COUNT(DISTINCT ta.task_id)
                 FROM tasks_assignees ta
                 JOIN tasks t ON t.id = ta.task_id
                 WHERE ta.team_member_id = tm.id
                   AND t.archived IS FALSE
                   AND t.status_id NOT IN (
                     SELECT id FROM task_statuses WHERE category_id IN (
                       SELECT id FROM sys_task_status_categories WHERE is_done IS TRUE
                     )
                   )
                ) AS tasks_in_progress,
                COALESCE((
                  SELECT SUM(twl.time_spent)
                  FROM task_work_log twl
                  WHERE twl.user_id = u.id AND twl.team_id = $1 AND twl.created_at::DATE = CURRENT_DATE::DATE
                ), 0) AS recorded_today_seconds,
                COALESCE((
                  SELECT SUM(tta.approved_duration)
                  FROM task_time_approvals tta
                  WHERE tta.team_member_id = tm.id AND tta.team_id = $1
                    AND tta.status IN ('APPROVED', 'ADJUSTED')
                    AND tta.reviewed_at::DATE = CURRENT_DATE::DATE
                ), 0) AS approved_today_seconds,
                (SELECT COUNT(*)
                 FROM task_time_approvals tta
                 WHERE tta.team_member_id = tm.id AND tta.team_id = $1 AND tta.status = 'PENDING'
                ) AS pending_count
         FROM team_members tm
         JOIN users u ON u.id = tm.user_id
         LEFT JOIN roles r ON r.id = tm.role_id
         WHERE tm.id = ANY($2::UUID[])
         ORDER BY u.name ASC;`,
        [teamId, subordinateMemberIds]
      );

      teamMembersSummary = summaryRes.rows.map((row: any) => ({
        team_member_id: row.team_member_id,
        user_id: row.user_id,
        name: row.member_name,
        email: row.member_email,
        avatar_url: row.member_avatar_url,
        role_name: row.role_name,
        tasks_in_progress: parseInt(row.tasks_in_progress, 10) || 0,
        recorded_today_seconds: parseInt(row.recorded_today_seconds, 10) || 0,
        approved_today_seconds: parseInt(row.approved_today_seconds, 10) || 0,
        pending_count: parseInt(row.pending_count, 10) || 0,
      }));

      // Top 5 pending approvals for quick review
      const allPending = await this.getPendingApprovals({
        teamId,
        userId,
        isAdmin,
        status: TaskTimeApprovalStatus.PENDING,
      });
      recentPendingApprovals = allPending.slice(0, 5);
    }

    return {
      my_work: {
        tasks_count: myTasksCount,
        tasks_today_count: myTasksTodayCount,
        tasks_completed_today_count: myTasksCompletedToday,
        recorded_today_seconds: recordedTodaySeconds,
        approved_today_seconds: approvedTodaySeconds,
        pending_submissions_count: pendingSubmissionsCount,
        pending_submissions_seconds: pendingSubmissionsSeconds,
        recent_submissions: recentSubmissions,
      },
      my_team: {
        is_manager: isManager,
        employees_count: teamEmployeesCount,
        tasks_in_progress_count: teamTasksInProgressCount,
        pending_approvals_count: teamPendingApprovalsCount,
        pending_time_seconds: teamPendingTimeSeconds,
        overdue_tasks_count: teamOverdueTasksCount,
        recorded_today_seconds: teamRecordedTodaySeconds,
        approved_today_seconds: teamApprovedTodaySeconds,
        team_members_summary: teamMembersSummary,
        recent_pending_approvals: recentPendingApprovals,
      },
    };
  }

  /**
   * Helper: Resolve accessible member IDs based on user permissions
   */
  public static async resolveReportScope(params: {
    teamId: string;
    userId: string;
    isAdmin?: boolean;
  }): Promise<{ isManager: boolean; subordinateMemberIds: string[]; currentMemberId: string | null }> {
    const { teamId, userId, isAdmin } = params;

    const currentMemberRes = await db.query(
      `SELECT tm.id, tm.role_id, r.name AS role_name
       FROM team_members tm
       LEFT JOIN roles r ON r.id = tm.role_id
       WHERE tm.user_id = $1 AND tm.team_id = $2 AND tm.active = TRUE;`,
      [userId, teamId]
    );

    const currentMember = currentMemberRes.rows[0];
    const currentMemberId = currentMember?.id || null;
    const isTeamLead =
      currentMember?.role_name?.toLowerCase().includes("team lead") ||
      currentMember?.role_name?.toLowerCase().includes("lead");

    let isManager = !!isAdmin || !!isTeamLead;
    let subordinateMemberIds: string[] = [];

    if (isAdmin) {
      const allMembersRes = await db.query(
        `SELECT id FROM team_members WHERE team_id = $1 AND active = TRUE;`,
        [teamId]
      );
      subordinateMemberIds = allMembersRes.rows.map((r: any) => r.id);
      isManager = true;
    } else if (currentMemberId) {
      const subMembersRes = await db.query(
        `SELECT tm.id
         FROM team_members tm
         WHERE tm.team_id = $1 AND tm.active = TRUE
           AND (tm.id = $2 OR tm.reports_to_member_id = $2 OR tm.id IN (
             SELECT managed_member_id FROM team_lead_managed_members WHERE manager_id = $2
           ));`,
        [teamId, currentMemberId]
      );
      subordinateMemberIds = subMembersRes.rows.map((r: any) => r.id);
      if (subordinateMemberIds.length > 1 || isTeamLead) {
        isManager = true;
      }
    }

    if (subordinateMemberIds.length === 0 && currentMemberId) {
      subordinateMemberIds = [currentMemberId];
    }

    return { isManager, subordinateMemberIds, currentMemberId };
  }

  /**
   * Helper: Build common SQL filters for reporting queries
   */
  private static buildReportFilters(
    params: IApprovalReportFilterParams,
    subordinateMemberIds: string[],
    paramStartIndex: number = 3
  ): {
    whereConditions: string[];
    queryParams: any[];
  } {
    const { employeeId, projectId, status, startDate, endDate, search } = params;
    const conditions: string[] = [];
    const queryParams: any[] = [];
    let idx = paramStartIndex;

    if (employeeId) {
      conditions.push(`tta.team_member_id = $${idx++}`);
      queryParams.push(employeeId);
    }

    if (projectId) {
      conditions.push(`t.project_id = $${idx++}`);
      queryParams.push(projectId);
    }

    if (status && status !== "ALL") {
      conditions.push(`tta.status = $${idx++}`);
      queryParams.push(status);
    }

    if (startDate) {
      conditions.push(`tta.submitted_at::DATE >= $${idx++}::DATE`);
      queryParams.push(startDate);
    }

    if (endDate) {
      conditions.push(`tta.submitted_at::DATE <= $${idx++}::DATE`);
      queryParams.push(endDate);
    }

    if (search && search.trim()) {
      conditions.push(`(t.name ILIKE $${idx} OR u.name ILIKE $${idx} OR p.name ILIKE $${idx})`);
      queryParams.push(`%${search.trim()}%`);
      idx++;
    }

    return { whereConditions: conditions, queryParams };
  }

  /**
   * Get Approval Reports Summary (KPI Cards)
   */
  public static async getApprovalReportsSummary(
    params: IApprovalReportFilterParams
  ): Promise<{
    total_recorded_seconds: number;
    total_approved_seconds: number;
    total_pending_seconds: number;
    total_adjustment_seconds: number;
    adjustment_percentage: number;
    total_estimated_seconds: number;
    tasks_above_estimate_count: number;
    tasks_above_maximum_count: number;
    approved_tasks_count: number;
    adjusted_tasks_count: number;
    rejected_submissions_count: number;
    pending_submissions_count: number;
    total_submissions_count: number;
    total_members_count: number;
    total_projects_count: number;
  }> {
    const { teamId, userId, isAdmin } = params;
    const { subordinateMemberIds } = await this.resolveReportScope({ teamId, userId, isAdmin });

    if (subordinateMemberIds.length === 0) {
      return {
        total_recorded_seconds: 0,
        total_approved_seconds: 0,
        total_pending_seconds: 0,
        total_adjustment_seconds: 0,
        adjustment_percentage: 0,
        total_estimated_seconds: 0,
        tasks_above_estimate_count: 0,
        tasks_above_maximum_count: 0,
        approved_tasks_count: 0,
        adjusted_tasks_count: 0,
        rejected_submissions_count: 0,
        pending_submissions_count: 0,
        total_submissions_count: 0,
        total_members_count: 0,
        total_projects_count: 0,
      };
    }

    const { whereConditions, queryParams } = this.buildReportFilters(params, subordinateMemberIds, 3);
    const extraWhere = whereConditions.length > 0 ? ` AND ${whereConditions.join(" AND ")}` : "";

    const query = `
      SELECT 
        COALESCE(SUM(tta.recorded_duration), 0) AS total_recorded_seconds,
        COALESCE(SUM(CASE WHEN tta.status IN ('APPROVED', 'ADJUSTED') THEN tta.approved_duration ELSE 0 END), 0) AS total_approved_seconds,
        COALESCE(SUM(CASE WHEN tta.status = 'PENDING' THEN tta.recorded_duration ELSE 0 END), 0) AS total_pending_seconds,
        COALESCE(SUM(CASE WHEN tta.status IN ('APPROVED', 'ADJUSTED') THEN (tta.recorded_duration - tta.approved_duration) ELSE 0 END), 0) AS total_adjustment_seconds,
        COALESCE(SUM(t.total_minutes * 60), 0) AS total_estimated_seconds,
        COUNT(DISTINCT CASE WHEN tta.recorded_duration > (t.total_minutes * 60) AND t.total_minutes > 0 THEN tta.task_id END) AS tasks_above_estimate_count,
        COUNT(DISTINCT CASE WHEN t.maximum_approved_minutes IS NOT NULL AND tta.recorded_duration > (t.maximum_approved_minutes * 60) THEN tta.task_id END) AS tasks_above_maximum_count,
        COUNT(CASE WHEN tta.status = 'APPROVED' THEN 1 END) AS approved_tasks_count,
        COUNT(CASE WHEN tta.status = 'ADJUSTED' THEN 1 END) AS adjusted_tasks_count,
        COUNT(CASE WHEN tta.status = 'REJECTED' THEN 1 END) AS rejected_submissions_count,
        COUNT(CASE WHEN tta.status = 'PENDING' THEN 1 END) AS pending_submissions_count,
        COUNT(tta.id) AS total_submissions_count,
        COUNT(DISTINCT tta.team_member_id) AS total_members_count,
        COUNT(DISTINCT t.project_id) AS total_projects_count
      FROM task_time_approvals tta
      JOIN tasks t ON t.id = tta.task_id
      JOIN projects p ON p.id = t.project_id
      JOIN team_members tm ON tm.id = tta.team_member_id
      JOIN users u ON u.id = tm.user_id
      WHERE tta.team_id = $1
        AND tta.team_member_id = ANY($2::UUID[])
        ${extraWhere};
    `;

    const res = await db.query(query, [teamId, subordinateMemberIds, ...queryParams]);
    const row = res.rows[0] || {};

    const totalRecorded = parseInt(row.total_recorded_seconds, 10) || 0;
    const totalApproved = parseInt(row.total_approved_seconds, 10) || 0;
    const totalAdjustment = parseInt(row.total_adjustment_seconds, 10) || 0;
    const adjustmentPct = totalRecorded > 0 ? Math.round((totalAdjustment / totalRecorded) * 10000) / 100 : 0;

    return {
      total_recorded_seconds: totalRecorded,
      total_approved_seconds: totalApproved,
      total_pending_seconds: parseInt(row.total_pending_seconds, 10) || 0,
      total_adjustment_seconds: totalAdjustment,
      adjustment_percentage: adjustmentPct,
      total_estimated_seconds: parseInt(row.total_estimated_seconds, 10) || 0,
      tasks_above_estimate_count: parseInt(row.tasks_above_estimate_count, 10) || 0,
      tasks_above_maximum_count: parseInt(row.tasks_above_maximum_count, 10) || 0,
      approved_tasks_count: parseInt(row.approved_tasks_count, 10) || 0,
      adjusted_tasks_count: parseInt(row.adjusted_tasks_count, 10) || 0,
      rejected_submissions_count: parseInt(row.rejected_submissions_count, 10) || 0,
      pending_submissions_count: parseInt(row.pending_submissions_count, 10) || 0,
      total_submissions_count: parseInt(row.total_submissions_count, 10) || 0,
      total_members_count: parseInt(row.total_members_count, 10) || 0,
      total_projects_count: parseInt(row.total_projects_count, 10) || 0,
    };
  }

  /**
   * Get Employee Report
   * Metrics: Tasks completed, Estimated, Recorded, Approved, Adjustment, Average Variance, Tasks > Estimate, Tasks > Max
   */
  public static async getEmployeeReports(params: IApprovalReportFilterParams): Promise<any[]> {
    const { teamId, userId, isAdmin, employeeId, projectId, status, startDate, endDate, search } = params;
    const { subordinateMemberIds } = await this.resolveReportScope({ teamId, userId, isAdmin });

    if (subordinateMemberIds.length === 0) {
      return [];
    }

    let targetMemberIds = subordinateMemberIds;
    if (employeeId && subordinateMemberIds.includes(employeeId)) {
      targetMemberIds = [employeeId];
    }

    const conditions: string[] = [];
    const queryParams: any[] = [teamId, targetMemberIds];
    let idx = 3;

    if (projectId) {
      conditions.push(`t.project_id = $${idx++}`);
      queryParams.push(projectId);
    }

    if (status && status !== "ALL") {
      conditions.push(`tta.status = $${idx++}`);
      queryParams.push(status);
    }

    if (startDate) {
      conditions.push(`tta.submitted_at::DATE >= $${idx++}::DATE`);
      queryParams.push(startDate);
    }

    if (endDate) {
      conditions.push(`tta.submitted_at::DATE <= $${idx++}::DATE`);
      queryParams.push(endDate);
    }

    const ttaFilterClause = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

    let memberSearchClause = "";
    if (search && search.trim()) {
      memberSearchClause = ` AND (u.name ILIKE $${idx} OR u.email ILIKE $${idx})`;
      queryParams.push(`%${search.trim()}%`);
      idx++;
    }

    const query = `
      SELECT 
        tm.id AS team_member_id,
        u.id AS user_id,
        u.name,
        u.email,
        u.avatar_url,
        r.name AS role_name,
        COALESCE((
          SELECT COUNT(DISTINCT t.id)
          FROM tasks t
          JOIN tasks_assignees ta ON ta.task_id = t.id
          WHERE ta.team_member_id = tm.id
            AND t.archived IS FALSE
            AND is_completed(t.status_id, t.project_id)
        ), 0) AS tasks_completed_count,
        COALESCE((
          SELECT COUNT(DISTINCT t.id)
          FROM tasks t
          JOIN tasks_assignees ta ON ta.task_id = t.id
          WHERE ta.team_member_id = tm.id
            AND t.archived IS FALSE
        ), 0) AS total_tasks_count,
        COALESCE(SUM(t.total_minutes * 60), 0) AS estimated_seconds,
        COALESCE(SUM(tta.recorded_duration), 0) AS recorded_seconds,
        COALESCE(SUM(CASE WHEN tta.status IN ('APPROVED', 'ADJUSTED') THEN tta.approved_duration ELSE 0 END), 0) AS approved_seconds,
        COALESCE(SUM(CASE WHEN tta.status = 'PENDING' THEN tta.recorded_duration ELSE 0 END), 0) AS pending_seconds,
        COALESCE(SUM(CASE WHEN tta.status IN ('APPROVED', 'ADJUSTED') THEN (tta.recorded_duration - tta.approved_duration) ELSE 0 END), 0) AS adjustment_seconds,
        COUNT(DISTINCT CASE WHEN tta.recorded_duration > (t.total_minutes * 60) AND t.total_minutes > 0 THEN tta.task_id END) AS tasks_above_estimate_count,
        COUNT(DISTINCT CASE WHEN t.maximum_approved_minutes IS NOT NULL AND tta.recorded_duration > (t.maximum_approved_minutes * 60) THEN tta.task_id END) AS tasks_above_maximum_count,
        COUNT(CASE WHEN tta.status = 'APPROVED' THEN 1 END) AS approved_count,
        COUNT(CASE WHEN tta.status = 'ADJUSTED' THEN 1 END) AS adjusted_count,
        COUNT(CASE WHEN tta.status = 'REJECTED' THEN 1 END) AS rejected_count,
        COUNT(CASE WHEN tta.status = 'PENDING' THEN 1 END) AS pending_count,
        COUNT(tta.id) AS total_submissions_count
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN roles r ON r.id = tm.role_id
      LEFT JOIN task_time_approvals tta ON tta.team_member_id = tm.id AND tta.team_id = $1 ${ttaFilterClause}
      LEFT JOIN tasks t ON t.id = tta.task_id
      WHERE tm.team_id = $1
        AND tm.active = TRUE
        AND tm.id = ANY($2::UUID[])
        ${memberSearchClause}
      GROUP BY tm.id, u.id, u.name, u.email, u.avatar_url, r.name
      ORDER BY u.name ASC;
    `;

    const res = await db.query(query, queryParams);

    return res.rows.map((row: any) => {
      const estimated = parseInt(row.estimated_seconds, 10) || 0;
      const recorded = parseInt(row.recorded_seconds, 10) || 0;
      const approved = parseInt(row.approved_seconds, 10) || 0;
      const pending = parseInt(row.pending_seconds, 10) || 0;
      const adjustment = parseInt(row.adjustment_seconds, 10) || 0;

      let variancePct = 0;
      if (estimated > 0) {
        variancePct = Math.round(((recorded - estimated) / estimated) * 10000) / 100;
      }

      return {
        team_member_id: row.team_member_id,
        user_id: row.user_id,
        name: row.name,
        email: row.email,
        avatar_url: row.avatar_url,
        role_name: row.role_name || "Member",
        tasks_completed_count: parseInt(row.tasks_completed_count, 10) || 0,
        total_tasks_count: parseInt(row.total_tasks_count, 10) || 0,
        estimated_seconds: estimated,
        recorded_seconds: recorded,
        approved_seconds: approved,
        pending_seconds: pending,
        adjustment_seconds: adjustment,
        average_variance_percentage: variancePct,
        tasks_above_estimate_count: parseInt(row.tasks_above_estimate_count, 10) || 0,
        tasks_above_maximum_count: parseInt(row.tasks_above_maximum_count, 10) || 0,
        approved_count: parseInt(row.approved_count, 10) || 0,
        adjusted_count: parseInt(row.adjusted_count, 10) || 0,
        rejected_count: parseInt(row.rejected_count, 10) || 0,
        pending_count: parseInt(row.pending_count, 10) || 0,
        total_submissions_count: parseInt(row.total_submissions_count, 10) || 0,
      };
    });
  }

  /**
   * Get Team Report
   * Shows: Employee, Tasks, Estimated, Recorded, Approved, Difference
   */
  public static async getTeamReports(params: IApprovalReportFilterParams): Promise<any[]> {
    const { teamId, userId, isAdmin, employeeId, projectId, status, startDate, endDate, search } = params;
    const { subordinateMemberIds } = await this.resolveReportScope({ teamId, userId, isAdmin });

    if (subordinateMemberIds.length === 0) {
      return [];
    }

    let targetMemberIds = subordinateMemberIds;
    if (employeeId && subordinateMemberIds.includes(employeeId)) {
      targetMemberIds = [employeeId];
    }

    const conditions: string[] = [];
    const queryParams: any[] = [teamId, targetMemberIds];
    let idx = 3;

    if (projectId) {
      conditions.push(`t.project_id = $${idx++}`);
      queryParams.push(projectId);
    }

    if (status && status !== "ALL") {
      conditions.push(`tta.status = $${idx++}`);
      queryParams.push(status);
    }

    if (startDate) {
      conditions.push(`tta.submitted_at::DATE >= $${idx++}::DATE`);
      queryParams.push(startDate);
    }

    if (endDate) {
      conditions.push(`tta.submitted_at::DATE <= $${idx++}::DATE`);
      queryParams.push(endDate);
    }

    const ttaFilterClause = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

    let memberSearchClause = "";
    if (search && search.trim()) {
      memberSearchClause = ` AND (u.name ILIKE $${idx} OR u.email ILIKE $${idx})`;
      queryParams.push(`%${search.trim()}%`);
      idx++;
    }

    const query = `
      SELECT 
        tm.id AS team_member_id,
        u.id AS user_id,
        u.name,
        u.email,
        u.avatar_url,
        r.name AS role_name,
        COUNT(DISTINCT tta.task_id) AS tasks_count,
        COALESCE(SUM(t.total_minutes * 60), 0) AS estimated_seconds,
        COALESCE(SUM(tta.recorded_duration), 0) AS recorded_seconds,
        COALESCE(SUM(CASE WHEN tta.status IN ('APPROVED', 'ADJUSTED') THEN tta.approved_duration ELSE 0 END), 0) AS approved_seconds,
        COALESCE(SUM(CASE WHEN tta.status = 'PENDING' THEN tta.recorded_duration ELSE 0 END), 0) AS pending_seconds,
        COALESCE(SUM(CASE WHEN tta.status IN ('APPROVED', 'ADJUSTED') THEN (tta.recorded_duration - tta.approved_duration) ELSE 0 END), 0) AS difference_seconds,
        COUNT(CASE WHEN tta.status = 'APPROVED' THEN 1 END) AS approved_count,
        COUNT(CASE WHEN tta.status = 'ADJUSTED' THEN 1 END) AS adjusted_count,
        COUNT(CASE WHEN tta.status = 'REJECTED' THEN 1 END) AS rejected_count,
        COUNT(CASE WHEN tta.status = 'PENDING' THEN 1 END) AS pending_count
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN roles r ON r.id = tm.role_id
      LEFT JOIN task_time_approvals tta ON tta.team_member_id = tm.id AND tta.team_id = $1 ${ttaFilterClause}
      LEFT JOIN tasks t ON t.id = tta.task_id
      WHERE tm.team_id = $1
        AND tm.active = TRUE
        AND tm.id = ANY($2::UUID[])
        ${memberSearchClause}
      GROUP BY tm.id, u.id, u.name, u.email, u.avatar_url, r.name
      ORDER BY u.name ASC;
    `;

    const res = await db.query(query, queryParams);

    return res.rows.map((row: any) => {
      const estimated = parseInt(row.estimated_seconds, 10) || 0;
      const recorded = parseInt(row.recorded_seconds, 10) || 0;
      const approved = parseInt(row.approved_seconds, 10) || 0;
      const difference = parseInt(row.difference_seconds, 10) || 0;

      let variancePct = 0;
      if (estimated > 0) {
        variancePct = Math.round(((recorded - estimated) / estimated) * 10000) / 100;
      }

      return {
        team_member_id: row.team_member_id,
        user_id: row.user_id,
        name: row.name,
        email: row.email,
        avatar_url: row.avatar_url,
        role_name: row.role_name || "Member",
        tasks_count: parseInt(row.tasks_count, 10) || 0,
        estimated_seconds: estimated,
        recorded_seconds: recorded,
        approved_seconds: approved,
        pending_seconds: parseInt(row.pending_seconds, 10) || 0,
        difference_seconds: difference,
        variance_percentage: variancePct,
        approved_count: parseInt(row.approved_count, 10) || 0,
        adjusted_count: parseInt(row.adjusted_count, 10) || 0,
        rejected_count: parseInt(row.rejected_count, 10) || 0,
        pending_count: parseInt(row.pending_count, 10) || 0,
      };
    });
  }

  /**
   * Get Project Report
   * Shows: Estimated, Recorded, Approved, Variance
   */
  public static async getProjectReports(params: IApprovalReportFilterParams): Promise<any[]> {
    const { teamId, userId, isAdmin, employeeId, projectId, status, startDate, endDate, search } = params;
    const { subordinateMemberIds } = await this.resolveReportScope({ teamId, userId, isAdmin });

    if (subordinateMemberIds.length === 0) {
      return [];
    }

    const conditions: string[] = [];
    const queryParams: any[] = [teamId, subordinateMemberIds];
    let idx = 3;

    if (employeeId) {
      conditions.push(`tta.team_member_id = $${idx++}`);
      queryParams.push(employeeId);
    }

    if (projectId) {
      conditions.push(`p.id = $${idx++}`);
      queryParams.push(projectId);
    }

    if (status && status !== "ALL") {
      conditions.push(`tta.status = $${idx++}`);
      queryParams.push(status);
    }

    if (startDate) {
      conditions.push(`tta.submitted_at::DATE >= $${idx++}::DATE`);
      queryParams.push(startDate);
    }

    if (endDate) {
      conditions.push(`tta.submitted_at::DATE <= $${idx++}::DATE`);
      queryParams.push(endDate);
    }

    if (search && search.trim()) {
      conditions.push(`(p.name ILIKE $${idx} OR p.key ILIKE $${idx})`);
      queryParams.push(`%${search.trim()}%`);
      idx++;
    }

    const extraWhere = conditions.length > 0 ? ` AND ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT 
        p.id AS project_id,
        p.name AS project_name,
        p.key AS project_key,
        p.color_code AS project_color,
        COUNT(DISTINCT tta.task_id) AS tasks_count,
        COALESCE(SUM(t.total_minutes * 60), 0) AS estimated_seconds,
        COALESCE(SUM(tta.recorded_duration), 0) AS recorded_seconds,
        COALESCE(SUM(CASE WHEN tta.status IN ('APPROVED', 'ADJUSTED') THEN tta.approved_duration ELSE 0 END), 0) AS approved_seconds,
        COALESCE(SUM(CASE WHEN tta.status = 'PENDING' THEN tta.recorded_duration ELSE 0 END), 0) AS pending_seconds,
        COALESCE(SUM(CASE WHEN tta.status IN ('APPROVED', 'ADJUSTED') THEN (tta.recorded_duration - tta.approved_duration) ELSE 0 END), 0) AS difference_seconds,
        COUNT(DISTINCT CASE WHEN tta.recorded_duration > (t.total_minutes * 60) AND t.total_minutes > 0 THEN tta.task_id END) AS tasks_above_estimate_count,
        COUNT(DISTINCT CASE WHEN t.maximum_approved_minutes IS NOT NULL AND tta.recorded_duration > (t.maximum_approved_minutes * 60) THEN tta.task_id END) AS tasks_above_maximum_count,
        COUNT(CASE WHEN tta.status = 'APPROVED' THEN 1 END) AS approved_count,
        COUNT(CASE WHEN tta.status = 'ADJUSTED' THEN 1 END) AS adjusted_count,
        COUNT(CASE WHEN tta.status = 'REJECTED' THEN 1 END) AS rejected_count,
        COUNT(CASE WHEN tta.status = 'PENDING' THEN 1 END) AS pending_count
      FROM projects p
      JOIN tasks t ON t.project_id = p.id
      JOIN task_time_approvals tta ON tta.task_id = t.id AND tta.team_id = $1
      WHERE p.team_id = $1
        AND tta.team_member_id = ANY($2::UUID[])
        ${extraWhere}
      GROUP BY p.id, p.name, p.key, p.color_code
      ORDER BY p.name ASC;
    `;

    const res = await db.query(query, queryParams);

    return res.rows.map((row: any) => {
      const estimated = parseInt(row.estimated_seconds, 10) || 0;
      const recorded = parseInt(row.recorded_seconds, 10) || 0;
      const approved = parseInt(row.approved_seconds, 10) || 0;
      const difference = parseInt(row.difference_seconds, 10) || 0;

      let variancePct = 0;
      if (estimated > 0) {
        variancePct = Math.round(((recorded - estimated) / estimated) * 10000) / 100;
      }

      return {
        project_id: row.project_id,
        project_name: row.project_name,
        project_key: row.project_key,
        project_color: row.project_color,
        tasks_count: parseInt(row.tasks_count, 10) || 0,
        estimated_seconds: estimated,
        recorded_seconds: recorded,
        approved_seconds: approved,
        pending_seconds: parseInt(row.pending_seconds, 10) || 0,
        difference_seconds: difference,
        variance_percentage: variancePct,
        tasks_above_estimate_count: parseInt(row.tasks_above_estimate_count, 10) || 0,
        tasks_above_maximum_count: parseInt(row.tasks_above_maximum_count, 10) || 0,
        approved_count: parseInt(row.approved_count, 10) || 0,
        adjusted_count: parseInt(row.adjusted_count, 10) || 0,
        rejected_count: parseInt(row.rejected_count, 10) || 0,
        pending_count: parseInt(row.pending_count, 10) || 0,
      };
    });
  }

  /**
   * Helper: Format duration in seconds to "Xh Ym" string
   */
  public static formatDurationString(seconds: number): string {
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(Math.abs(totalMinutes) / 60);
    const minutes = Math.abs(totalMinutes) % 60;
    const sign = totalMinutes < 0 ? "-" : "";
    return `${sign}${hours}h ${minutes}m`;
  }

  /**
   * Helper: Sanitize manager comments and adjustment/rejection reasons for XSS prevention
   */
  public static sanitizeComment(comment: string | null | undefined): string {
    if (!comment) return "";
    return sanitizeCommentContent(comment);
  }
}



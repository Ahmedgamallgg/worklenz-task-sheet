import { IWorkLenzRequest } from "../interfaces/worklenz-request";
import { IWorkLenzResponse } from "../interfaces/worklenz-response";
import db from "../config/db";
import { ServerResponse } from "../models/server-response";
import WorklenzControllerBase from "./worklenz-controller-base";
import HandleExceptions from "../decorators/handle-exceptions";
import { IO } from "../shared/io";
import { SocketEvents } from "../socket.io/events";
import { TaskTimeApprovalStatus, TopLevelApprovalPolicy } from "../interfaces/task-time-approval";
import { insertToActivityLogs } from "../services/activity-logs/activity-logs.service";
import { IActivityLogAttributeTypes, IActivityLogChangeType } from "../services/activity-logs/interfaces";

export default class TaskTimeApprovalController extends WorklenzControllerBase {

  /**
   * Submit time for a task by a team member
   */
  @HandleExceptions()
  public static async submit(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const taskId = req.params.taskId || req.body.task_id;
    const userId = req.user?.id;
    const teamId = req.user?.team_id;

    if (!taskId || !userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Task ID and authentication details are required."));
    }

    // 1. Verify task belongs to user's team & get project info
    const taskQuery = `
      SELECT t.id, t.name, t.project_id, t.total_minutes, t.maximum_approved_minutes, p.team_id
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.id = $1 AND p.team_id = $2;
    `;
    const taskResult = await db.query(taskQuery, [taskId, teamId]);
    if (taskResult.rows.length === 0) {
      return res.status(404).send(new ServerResponse(false, null, "Task not found in the current team."));
    }
    const task = taskResult.rows[0];

    // 2. Get team member ID for this user in this team
    const memberQuery = `
      SELECT tm.id, tm.reports_to_member_id, tm.role_id, t.time_approval_policy
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = $1 AND tm.team_id = $2;
    `;
    const memberResult = await db.query(memberQuery, [userId, teamId]);
    if (memberResult.rows.length === 0) {
      return res.status(403).send(new ServerResponse(false, null, "You are not a member of this team."));
    }
    const member = memberResult.rows[0];
    const teamMemberId = member.id;

    // 3. Calculate total recorded duration (in seconds) for this user on this task
    const timeLogQuery = `
      SELECT COALESCE(SUM(time_spent), 0) AS total_seconds
      FROM task_work_log
      WHERE task_id = $1 AND user_id = $2;
    `;
    const timeLogResult = await db.query(timeLogQuery, [taskId, userId]);
    const recordedDuration = parseFloat(timeLogResult.rows[0]?.total_seconds || "0");

    if (recordedDuration <= 0) {
      return res.status(400).send(new ServerResponse(false, null, "Cannot submit time approval with zero recorded hours."));
    }

    // 4. Check if there is already a PENDING approval for this task and member
    const existingPendingQuery = `
      SELECT id FROM task_time_approvals
      WHERE task_id = $1 AND team_member_id = $2 AND status = $3;
    `;
    const existingPending = await db.query(existingPendingQuery, [taskId, teamMemberId, TaskTimeApprovalStatus.PENDING]);
    if (existingPending.rows.length > 0) {
      return res.status(409).send(new ServerResponse(false, null, "A pending time approval submission already exists for this task."));
    }

    // 5. Determine approver and policy
    let approverMemberId = member.reports_to_member_id || null;
    let initialStatus = TaskTimeApprovalStatus.PENDING;
    let approvedDuration = 0;

    // If top-level manager (reports_to_member_id is NULL)
    if (!approverMemberId) {
      const policy = member.time_approval_policy || TopLevelApprovalPolicy.NO_APPROVAL_REQUIRED;
      if (policy === TopLevelApprovalPolicy.AUTO_APPROVE || policy === TopLevelApprovalPolicy.NO_APPROVAL_REQUIRED) {
        initialStatus = TaskTimeApprovalStatus.APPROVED;
        approvedDuration = recordedDuration;
      }
    }

    // 6. Get previous submission count for versioning
    const countQuery = `
      SELECT COUNT(*)::INT AS submission_count
      FROM task_time_approvals
      WHERE task_id = $1 AND team_member_id = $2;
    `;
    const countResult = await db.query(countQuery, [taskId, teamMemberId]);
    const submissionNumber = (countResult.rows[0]?.submission_count || 0) + 1;

    // 7. Insert the new task_time_approvals record
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
    const reviewedAt = initialStatus === TaskTimeApprovalStatus.APPROVED ? new Date() : null;
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
      attribute_type: "time_approval",
      log_type: IActivityLogChangeType.CREATE,
      next_string: `Submitted ${Math.round(recordedDuration / 60)} minutes for approval`,
    });

    // 9. Emit socket event
    const io = IO.getInstance();
    if (io) {
      io.emit(SocketEvents.TASK_TIME_LOG_UPDATED.toString(), { task_id: taskId, approval_id: createdApproval.id, status: initialStatus });
    }

    return res.status(200).send(new ServerResponse(true, createdApproval, "Time submitted for approval successfully."));
  }

  /**
   * Approve a pending submission
   */
  @HandleExceptions()
  public static async approve(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const approvalId = req.params.id;
    const userId = req.user?.id;
    const teamId = req.user?.team_id;

    if (!approvalId || !userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Approval ID and authentication details are required."));
    }

    // 1. Get approval details and tenant context
    const approvalQuery = `
      SELECT tta.*, tm.user_id AS submitter_user_id, t.project_id, p.team_id
      FROM task_time_approvals tta
      JOIN team_members tm ON tm.id = tta.team_member_id
      JOIN tasks t ON t.id = tta.task_id
      JOIN projects p ON p.id = t.project_id
      WHERE tta.id = $1 AND p.team_id = $2;
    `;
    const approvalResult = await db.query(approvalQuery, [approvalId, teamId]);
    if (approvalResult.rows.length === 0) {
      return res.status(404).send(new ServerResponse(false, null, "Approval request not found."));
    }
    const approval = approvalResult.rows[0];

    // 2. CRITICAL RULE: Self-Approval Prevention
    if (approval.submitter_user_id === userId) {
      return res.status(403).send(new ServerResponse(false, null, "You cannot approve your own submitted work."));
    }

    // 3. Current approver team member ID
    const approverMemberQuery = `SELECT id FROM team_members WHERE user_id = $1 AND team_id = $2;`;
    const approverMemberResult = await db.query(approverMemberQuery, [userId, teamId]);
    const approverMemberId = approverMemberResult.rows[0]?.id;

    if (approval.status !== TaskTimeApprovalStatus.PENDING) {
      return res.status(400).send(new ServerResponse(false, null, `This submission is already ${approval.status.toLowerCase()}.`));
    }

    // 4. Update status to APPROVED
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
      approverMemberId,
      req.body.manager_comment || null,
      approvalId,
    ]);

    // 5. Activity log
    await insertToActivityLogs({
      task_id: approval.task_id,
      team_id: teamId,
      project_id: approval.project_id,
      user_id: userId,
      attribute_type: "time_approval",
      log_type: IActivityLogChangeType.UPDATE,
      next_string: `Approved ${Math.round(approval.recorded_duration / 60)} minutes`,
    });

    const io = IO.getInstance();
    if (io) {
      io.emit(SocketEvents.TASK_TIME_LOG_UPDATED.toString(), { task_id: approval.task_id, approval_id: approvalId, status: TaskTimeApprovalStatus.APPROVED });
    }

    return res.status(200).send(new ServerResponse(true, updateResult.rows[0], "Time approved successfully."));
  }

  /**
   * Adjust approved duration (requires adjustment_reason)
   */
  @HandleExceptions()
  public static async adjust(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const approvalId = req.params.id;
    const { approved_duration, adjustment_reason, manager_comment } = req.body;
    const userId = req.user?.id;
    const teamId = req.user?.team_id;

    if (!approvalId || !userId || !teamId || approved_duration === undefined) {
      return res.status(400).send(new ServerResponse(false, null, "Approval ID, approved duration, and authentication are required."));
    }

    const approvedSeconds = parseFloat(approved_duration);
    if (isNaN(approvedSeconds) || approvedSeconds < 0) {
      return res.status(400).send(new ServerResponse(false, null, "Invalid approved duration."));
    }

    // 1. Get approval details
    const approvalQuery = `
      SELECT tta.*, tm.user_id AS submitter_user_id, t.project_id, p.team_id
      FROM task_time_approvals tta
      JOIN team_members tm ON tm.id = tta.team_member_id
      JOIN tasks t ON t.id = tta.task_id
      JOIN projects p ON p.id = t.project_id
      WHERE tta.id = $1 AND p.team_id = $2;
    `;
    const approvalResult = await db.query(approvalQuery, [approvalId, teamId]);
    if (approvalResult.rows.length === 0) {
      return res.status(404).send(new ServerResponse(false, null, "Approval request not found."));
    }
    const approval = approvalResult.rows[0];

    // 2. CRITICAL RULE: Self-Approval Prevention
    if (approval.submitter_user_id === userId) {
      return res.status(403).send(new ServerResponse(false, null, "You cannot adjust your own submitted work."));
    }

    // 3. CRITICAL RULE: Adjustment Reason is mandatory if approved != recorded
    const recordedSeconds = parseFloat(approval.recorded_duration);
    if (approvedSeconds !== recordedSeconds) {
      if (!adjustment_reason || !adjustment_reason.trim()) {
        return res.status(400).send(new ServerResponse(false, null, "A reason is required when approved time differs from recorded time."));
      }
    }

    // 4. Approver member ID
    const approverMemberQuery = `SELECT id FROM team_members WHERE user_id = $1 AND team_id = $2;`;
    const approverMemberResult = await db.query(approverMemberQuery, [userId, teamId]);
    const approverMemberId = approverMemberResult.rows[0]?.id;

    // 5. Update task_time_approvals (CRITICAL: task_work_log is NOT modified)
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
      adjustment_reason ? adjustment_reason.trim() : null,
      manager_comment ? manager_comment.trim() : null,
      approverMemberId,
      approvalId,
    ]);

    // 6. Activity log
    await insertToActivityLogs({
      task_id: approval.task_id,
      team_id: teamId,
      project_id: approval.project_id,
      user_id: userId,
      attribute_type: "time_approval",
      log_type: IActivityLogChangeType.UPDATE,
      next_string: `Adjusted approved time to ${Math.round(approvedSeconds / 60)} minutes (Recorded: ${Math.round(recordedSeconds / 60)}m). Reason: ${adjustment_reason || 'N/A'}`,
    });

    const io = IO.getInstance();
    if (io) {
      io.emit(SocketEvents.TASK_TIME_LOG_UPDATED.toString(), { task_id: approval.task_id, approval_id: approvalId, status: newStatus });
    }

    return res.status(200).send(new ServerResponse(true, updateResult.rows[0], "Time adjusted and approved successfully."));
  }

  /**
   * Reject a submission with mandatory rejection reason
   */
  @HandleExceptions()
  public static async reject(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const approvalId = req.params.id;
    const { rejection_reason, manager_comment } = req.body;
    const userId = req.user?.id;
    const teamId = req.user?.team_id;

    if (!approvalId || !userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Approval ID and authentication are required."));
    }

    if (!rejection_reason || !rejection_reason.trim()) {
      return res.status(400).send(new ServerResponse(false, null, "A reason is required when rejecting a time submission."));
    }

    // 1. Get approval details
    const approvalQuery = `
      SELECT tta.*, tm.user_id AS submitter_user_id, t.project_id, p.team_id
      FROM task_time_approvals tta
      JOIN team_members tm ON tm.id = tta.team_member_id
      JOIN tasks t ON t.id = tta.task_id
      JOIN projects p ON p.id = t.project_id
      WHERE tta.id = $1 AND p.team_id = $2;
    `;
    const approvalResult = await db.query(approvalQuery, [approvalId, teamId]);
    if (approvalResult.rows.length === 0) {
      return res.status(404).send(new ServerResponse(false, null, "Approval request not found."));
    }
    const approval = approvalResult.rows[0];

    // 2. Self-Approval check
    if (approval.submitter_user_id === userId) {
      return res.status(403).send(new ServerResponse(false, null, "You cannot reject your own submitted work."));
    }

    // 3. Approver member ID
    const approverMemberQuery = `SELECT id FROM team_members WHERE user_id = $1 AND team_id = $2;`;
    const approverMemberResult = await db.query(approverMemberQuery, [userId, teamId]);
    const approverMemberId = approverMemberResult.rows[0]?.id;

    // 4. Update status to REJECTED
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
      rejection_reason.trim(),
      manager_comment ? manager_comment.trim() : null,
      approverMemberId,
      approvalId,
    ]);

    // 5. Activity log
    await insertToActivityLogs({
      task_id: approval.task_id,
      team_id: teamId,
      project_id: approval.project_id,
      user_id: userId,
      attribute_type: "time_approval",
      log_type: IActivityLogChangeType.UPDATE,
      next_string: `Rejected time submission. Reason: ${rejection_reason.trim()}`,
    });

    const io = IO.getInstance();
    if (io) {
      io.emit(SocketEvents.TASK_TIME_LOG_UPDATED.toString(), { task_id: approval.task_id, approval_id: approvalId, status: TaskTimeApprovalStatus.REJECTED });
    }

    return res.status(200).send(new ServerResponse(true, updateResult.rows[0], "Time submission rejected."));
  }

  /**
   * Resubmit a rejected submission after updates
   */
  @HandleExceptions()
  public static async resubmit(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const approvalId = req.params.id;
    const userId = req.user?.id;
    const teamId = req.user?.team_id;

    if (!approvalId || !userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Approval ID and authentication are required."));
    }

    // 1. Get approval record
    const approvalQuery = `
      SELECT tta.*, tm.user_id AS submitter_user_id, t.project_id, p.team_id
      FROM task_time_approvals tta
      JOIN team_members tm ON tm.id = tta.team_member_id
      JOIN tasks t ON t.id = tta.task_id
      JOIN projects p ON p.id = t.project_id
      WHERE tta.id = $1 AND p.team_id = $2;
    `;
    const approvalResult = await db.query(approvalQuery, [approvalId, teamId]);
    if (approvalResult.rows.length === 0) {
      return res.status(404).send(new ServerResponse(false, null, "Approval record not found."));
    }
    const approval = approvalResult.rows[0];

    // Only owner of submission can resubmit
    if (approval.submitter_user_id !== userId) {
      return res.status(403).send(new ServerResponse(false, null, "Only the submitter can resubmit this time entry."));
    }

    // 2. Recalculate recorded time from task_work_log
    const timeLogQuery = `
      SELECT COALESCE(SUM(time_spent), 0) AS total_seconds
      FROM task_work_log
      WHERE task_id = $1 AND user_id = $2;
    `;
    const timeLogResult = await db.query(timeLogQuery, [approval.task_id, userId]);
    const recordedDuration = parseFloat(timeLogResult.rows[0]?.total_seconds || "0");

    // 3. Update approval record to PENDING with incremented version
    const updateQuery = `
      UPDATE task_time_approvals
      SET status = $1,
          recorded_duration = $2,
          approved_duration = 0,
          version = version + 1,
          submission_number = submission_number + 1,
          rejection_reason = NULL,
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

    // 4. Activity log
    await insertToActivityLogs({
      task_id: approval.task_id,
      team_id: teamId,
      project_id: approval.project_id,
      user_id: userId,
      attribute_type: "time_approval",
      log_type: IActivityLogChangeType.UPDATE,
      next_string: `Resubmitted ${Math.round(recordedDuration / 60)} minutes for approval (Submission #${updateResult.rows[0].submission_number})`,
    });

    const io = IO.getInstance();
    if (io) {
      io.emit(SocketEvents.TASK_TIME_LOG_UPDATED.toString(), { task_id: approval.task_id, approval_id: approvalId, status: TaskTimeApprovalStatus.PENDING });
    }

    return res.status(200).send(new ServerResponse(true, updateResult.rows[0], "Resubmitted successfully."));
  }

  /**
   * Get pending approvals for manager / team lead
   */
  @HandleExceptions()
  public static async getPendingApprovals(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const userId = req.user?.id;
    const teamId = req.user?.team_id;
    const { employee_id, project_id, status = TaskTimeApprovalStatus.PENDING, start_date, end_date } = req.query;

    if (!userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Authentication required."));
    }

    // Get current manager's team_member_id
    const memberQuery = `SELECT id, role_id FROM team_members WHERE user_id = $1 AND team_id = $2;`;
    const memberResult = await db.query(memberQuery, [userId, teamId]);
    if (memberResult.rows.length === 0) {
      return res.status(403).send(new ServerResponse(false, null, "Team member not found."));
    }
    const currentMemberId = memberResult.rows[0].id;
    const isAdmin = req.user?.is_admin || req.user?.owner;

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

    const params: any[] = [teamId];
    let paramIndex = 2;

    // Filter by status if provided (or 'ALL' for history)
    if (status && status !== 'ALL') {
      query += ` AND tta.status = $${paramIndex++}`;
      params.push(status);
    }

    // Role-based visibility:
    // If not admin, manager only sees submissions where they are the approver OR direct/indirect reports
    if (!isAdmin) {
      query += ` AND (
        tta.approver_member_id = $${paramIndex} 
        OR tm.reports_to_member_id = $${paramIndex}
      )`;
      params.push(currentMemberId);
      paramIndex++;
    }

    // Filter by employee
    if (employee_id) {
      query += ` AND tta.team_member_id = $${paramIndex++}`;
      params.push(employee_id);
    }

    // Filter by project
    if (project_id) {
      query += ` AND t.project_id = $${paramIndex++}`;
      params.push(project_id);
    }

    // Filter by date range
    if (start_date && end_date) {
      query += ` AND tta.submitted_at >= $${paramIndex++} AND tta.submitted_at <= $${paramIndex++}`;
      params.push(start_date, end_date);
    }

    query += ` ORDER BY tta.submitted_at DESC;`;

    const result = await db.query(query, params);
    return res.status(200).send(new ServerResponse(true, result.rows));
  }

  /**
   * Get employee's own submissions
   */
  @HandleExceptions()
  public static async getMySubmissions(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const userId = req.user?.id;
    const teamId = req.user?.team_id;

    if (!userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Authentication required."));
    }

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
    return res.status(200).send(new ServerResponse(true, result.rows));
  }

  /**
   * Get approval details by approval ID
   */
  @HandleExceptions()
  public static async getById(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const approvalId = req.params.id;
    const userId = req.user?.id;
    const teamId = req.user?.team_id;

    if (!approvalId || !userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Approval ID and authentication required."));
    }

    const query = `
      SELECT 
        tta.*,
        t.name AS task_name,
        t.task_no,
        t.description AS task_description,
        t.total_minutes AS task_estimated_minutes,
        t.maximum_approved_minutes,
        p.id AS project_id,
        p.name AS project_name,
        u.name AS member_name,
        u.email AS member_email,
        u.avatar_url AS member_avatar_url,
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
      return res.status(404).send(new ServerResponse(false, null, "Approval record not found."));
    }
    const approval = result.rows[0];

    // Authorization: User must be submitter, approver, or admin
    const isAdmin = req.user?.is_admin || req.user?.owner;
    const isSubmitter = approval.team_member_id === req.user?.team_member_id;
    const isApprover = approval.approver_member_id === req.user?.team_member_id;

    if (!isAdmin && !isSubmitter && !isApprover) {
      return res.status(403).send(new ServerResponse(false, null, "You are not authorized to view this approval record."));
    }

    // Get time log entries for this user & task
    const logsQuery = `
      SELECT id, time_spent, description, created_at, logged_by_timer
      FROM task_work_log
      WHERE task_id = $1 AND user_id = (SELECT user_id FROM team_members WHERE id = $2)
      ORDER BY created_at ASC;
    `;
    const logsResult = await db.query(logsQuery, [approval.task_id, approval.team_member_id]);
    approval.time_logs = logsResult.rows;

    // Get submission history for this task and member
    const historyQuery = `
      SELECT id, submission_number, version, recorded_duration, approved_duration, status,
             adjustment_reason, rejection_reason, manager_comment, submitted_at, reviewed_at
      FROM task_time_approvals
      WHERE task_id = $1 AND team_member_id = $2
      ORDER BY submission_number DESC;
    `;
    const historyResult = await db.query(historyQuery, [approval.task_id, approval.team_member_id]);
    approval.history = historyResult.rows;

    return res.status(200).send(new ServerResponse(true, approval));
  }

  /**
   * Get task-level time approval summary for task details view
   */
  @HandleExceptions()
  public static async getByTask(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const taskId = req.params.taskId || req.params.id;
    const userId = req.user?.id;
    const teamId = req.user?.team_id;

    if (!taskId || !userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Task ID and authentication required."));
    }

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
    return res.status(200).send(new ServerResponse(true, result.rows));
  }

  /**
   * Get team & member timesheet summary (Recorded, Approved, Pending, Adjusted)
   */
  @HandleExceptions()
  public static async getTimesheetSummary(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const userId = req.user?.id;
    const teamId = req.user?.team_id;
    const { member_id, start_date, end_date, scope = "my" } = req.query;

    if (!userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Authentication required."));
    }

    const isAdmin = req.user?.is_admin || req.user?.owner;
    let targetMemberId = req.user?.team_member_id;

    if (scope === "team" && isAdmin && member_id) {
      targetMemberId = member_id as string;
    }

    let dateFilter = "";
    const params: any[] = [teamId];
    let paramIndex = 2;

    if (start_date && end_date) {
      dateFilter = ` AND twl.created_at >= $${paramIndex++} AND twl.created_at <= $${paramIndex++}`;
      params.push(start_date, end_date);
    }

    let memberFilter = "";
    if (scope === "my" || (scope === "team" && member_id)) {
      memberFilter = ` AND tm.id = $${paramIndex++}`;
      params.push(targetMemberId);
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

    const result = await db.query(query, params);
    return res.status(200).send(new ServerResponse(true, result.rows));
  }
}

import { IWorkLenzRequest } from "../interfaces/worklenz-request";
import { IWorkLenzResponse } from "../interfaces/worklenz-response";
import { ServerResponse } from "../models/server-response";
import WorklenzControllerBase from "./worklenz-controller-base";
import HandleExceptions from "../decorators/handle-exceptions";
import { TaskTimeApprovalService } from "../services/task-time-approval.service";
import db from "../config/db";

export default class TaskTimeApprovalController extends WorklenzControllerBase {

  /**
   * Submit time for a task by a team member
   */
  @HandleExceptions()
  public static async submit(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const taskId = req.params.taskId || req.body.task_id;
    const user = req.user;
    const teamId = req.user?.team_id;

    if (!taskId || !user || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Task ID and authentication details are required."));
    }

    const result = await TaskTimeApprovalService.submit({ taskId, user, teamId });
    if (!result.success) {
      return res.status(result.error?.status || 400).send(new ServerResponse(false, null, result.error?.message));
    }

    return res.status(200).send(new ServerResponse(true, result.data, "Time submitted for approval successfully."));
  }

  /**
   * Approve a pending submission
   */
  @HandleExceptions()
  public static async approve(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const approvalId = req.params.id;
    const user = req.user;
    const teamId = req.user?.team_id;
    const { manager_comment } = req.body;

    if (!approvalId || !user || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Approval ID and authentication details are required."));
    }

    const result = await TaskTimeApprovalService.approve({
      approvalId,
      user,
      teamId,
      managerComment: manager_comment,
    });

    if (!result.success) {
      return res.status(result.error?.status || 400).send(new ServerResponse(false, null, result.error?.message));
    }

    return res.status(200).send(new ServerResponse(true, result.data, "Time approved successfully."));
  }

  /**
   * Adjust approved duration (requires adjustment_reason when approved != recorded)
   */
  @HandleExceptions()
  public static async adjust(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const approvalId = req.params.id;
    const user = req.user;
    const teamId = req.user?.team_id;
    const { approved_duration, adjustment_reason, manager_comment } = req.body;

    if (!approvalId || !user || !teamId || approved_duration === undefined) {
      return res.status(400).send(new ServerResponse(false, null, "Approval ID, approved duration, and authentication are required."));
    }

    const result = await TaskTimeApprovalService.adjust({
      approvalId,
      user,
      teamId,
      approvedDuration: approved_duration,
      adjustmentReason: adjustment_reason,
      managerComment: manager_comment,
    });

    if (!result.success) {
      return res.status(result.error?.status || 400).send(new ServerResponse(false, null, result.error?.message));
    }

    return res.status(200).send(new ServerResponse(true, result.data, "Time adjusted and approved successfully."));
  }

  /**
   * Reject a submission with mandatory rejection reason
   */
  @HandleExceptions()
  public static async reject(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const approvalId = req.params.id;
    const user = req.user;
    const teamId = req.user?.team_id;
    const { rejection_reason, manager_comment } = req.body;

    if (!approvalId || !user || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Approval ID and authentication are required."));
    }

    const result = await TaskTimeApprovalService.reject({
      approvalId,
      user,
      teamId,
      rejectionReason: rejection_reason,
      managerComment: manager_comment,
    });

    if (!result.success) {
      return res.status(result.error?.status || 400).send(new ServerResponse(false, null, result.error?.message));
    }

    return res.status(200).send(new ServerResponse(true, result.data, "Time submission rejected."));
  }

  /**
   * Resubmit a rejected submission after updates
   */
  @HandleExceptions()
  public static async resubmit(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const approvalId = req.params.id;
    const user = req.user;
    const teamId = req.user?.team_id;

    if (!approvalId || !user || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Approval ID and authentication are required."));
    }

    const result = await TaskTimeApprovalService.resubmit({
      approvalId,
      user,
      teamId,
    });

    if (!result.success) {
      return res.status(result.error?.status || 400).send(new ServerResponse(false, null, result.error?.message));
    }

    return res.status(200).send(new ServerResponse(true, result.data, "Resubmitted successfully."));
  }

  /**
   * Get pending approvals for manager / team lead
   */
  @HandleExceptions()
  public static async getPendingApprovals(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const userId = req.user?.id;
    const teamId = req.user?.team_id;
    const { employee_id, project_id, status, start_date, end_date, over_estimate, over_maximum, search } = req.query;

    if (!userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Authentication required."));
    }

    const isAdmin = req.user?.is_admin || req.user?.owner;

    const data = await TaskTimeApprovalService.getPendingApprovals({
      teamId,
      userId,
      isAdmin,
      employeeId: employee_id as string,
      projectId: project_id as string,
      status: status as string,
      startDate: start_date as string,
      endDate: end_date as string,
      overEstimate: over_estimate === "true",
      overMaximum: over_maximum === "true",
      search: search as string,
    });

    return res.status(200).send(new ServerResponse(true, data));
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

    const data = await TaskTimeApprovalService.getMySubmissions(userId, teamId);
    return res.status(200).send(new ServerResponse(true, data));
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

    const isAdmin = req.user?.is_admin || req.user?.owner;
    const result = await TaskTimeApprovalService.getById(approvalId, userId, teamId, isAdmin);

    if (!result.success) {
      return res.status(result.error?.status || 400).send(new ServerResponse(false, null, result.error?.message));
    }

    return res.status(200).send(new ServerResponse(true, result.data));
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

    const data = await TaskTimeApprovalService.getByTask(taskId, teamId);
    return res.status(200).send(new ServerResponse(true, data));
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

    // Get current member's ID
    const memberQuery = `SELECT id FROM team_members WHERE user_id = $1 AND team_id = $2;`;
    const memberRes = await db.query(memberQuery, [userId, teamId]);
    const currentMemberId = memberRes.rows[0]?.id;

    const isAdmin = req.user?.is_admin || req.user?.owner;
    let targetMemberId = currentMemberId;

    if (scope === "team" && isAdmin && member_id) {
      targetMemberId = member_id as string;
    }

    const data = await TaskTimeApprovalService.getTimesheetSummary({
      teamId,
      userId,
      targetMemberId,
      scope: scope as string,
      startDate: start_date as string,
      endDate: end_date as string,
    });

    return res.status(200).send(new ServerResponse(true, data));
  }

  /**
   * Get employee detailed timesheet with daily/weekly breakdown (GET /timesheets/my)
   */
  @HandleExceptions()
  public static async getMyTimesheet(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const userId = req.user?.id;
    const teamId = req.user?.team_id;
    const { start_date, end_date, view } = req.query;

    if (!userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Authentication required."));
    }

    const data = await TaskTimeApprovalService.getMyTimesheet({
      userId,
      teamId,
      startDate: start_date as string,
      endDate: end_date as string,
      view: view as string,
    });

    return res.status(200).send(new ServerResponse(true, data));
  }

  /**
   * Get team members timesheet breakdown for managers (GET /timesheets/team)
   */
  @HandleExceptions()
  public static async getTeamTimesheet(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const userId = req.user?.id;
    const teamId = req.user?.team_id;
    const { employee_id, project_id, status, start_date, end_date } = req.query;

    if (!userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Authentication required."));
    }

    const isAdmin = req.user?.is_admin || req.user?.owner;

    const data = await TaskTimeApprovalService.getTeamTimesheet({
      teamId,
      userId,
      isAdmin,
      employeeId: employee_id as string,
      projectId: project_id as string,
      status: status as string,
      startDate: start_date as string,
      endDate: end_date as string,
    });

    return res.status(200).send(new ServerResponse(true, data));
  }
}


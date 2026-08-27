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

  /**
   * Get Manager and Employee Dashboard statistics (GET /dashboard-stats)
   */
  @HandleExceptions()
  public static async getDashboardStats(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const userId = req.user?.id;
    const teamId = req.user?.team_id;

    if (!userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Authentication required."));
    }

    const isAdmin = req.user?.is_admin || req.user?.owner;

    const data = await TaskTimeApprovalService.getDashboardStats({
      userId,
      teamId,
      isAdmin,
    });

    return res.status(200).send(new ServerResponse(true, data));
  }

  /**
   * Get Approval Reports Summary (KPI Cards) (GET /reports/summary)
   */
  @HandleExceptions()
  public static async getReportsSummary(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const userId = req.user?.id;
    const teamId = req.user?.team_id;
    const { employee_id, project_id, status, start_date, end_date, search } = req.query;

    if (!userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Authentication required."));
    }

    const isAdmin = req.user?.is_admin || req.user?.owner;

    const data = await TaskTimeApprovalService.getApprovalReportsSummary({
      teamId,
      userId,
      isAdmin,
      employeeId: employee_id as string,
      projectId: project_id as string,
      status: status as string,
      startDate: start_date as string,
      endDate: end_date as string,
      search: search as string,
    });

    return res.status(200).send(new ServerResponse(true, data));
  }

  /**
   * Get Employee Report (GET /reports/employees)
   */
  @HandleExceptions()
  public static async getEmployeeReports(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const userId = req.user?.id;
    const teamId = req.user?.team_id;
    const { employee_id, project_id, status, start_date, end_date, search } = req.query;

    if (!userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Authentication required."));
    }

    const isAdmin = req.user?.is_admin || req.user?.owner;

    const data = await TaskTimeApprovalService.getEmployeeReports({
      teamId,
      userId,
      isAdmin,
      employeeId: employee_id as string,
      projectId: project_id as string,
      status: status as string,
      startDate: start_date as string,
      endDate: end_date as string,
      search: search as string,
    });

    return res.status(200).send(new ServerResponse(true, data));
  }

  /**
   * Get Team Report (GET /reports/team)
   */
  @HandleExceptions()
  public static async getTeamReports(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const userId = req.user?.id;
    const teamId = req.user?.team_id;
    const { employee_id, project_id, status, start_date, end_date, search } = req.query;

    if (!userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Authentication required."));
    }

    const isAdmin = req.user?.is_admin || req.user?.owner;

    const data = await TaskTimeApprovalService.getTeamReports({
      teamId,
      userId,
      isAdmin,
      employeeId: employee_id as string,
      projectId: project_id as string,
      status: status as string,
      startDate: start_date as string,
      endDate: end_date as string,
      search: search as string,
    });

    return res.status(200).send(new ServerResponse(true, data));
  }

  /**
   * Get Project Report (GET /reports/projects)
   */
  @HandleExceptions()
  public static async getProjectReports(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const userId = req.user?.id;
    const teamId = req.user?.team_id;
    const { employee_id, project_id, status, start_date, end_date, search } = req.query;

    if (!userId || !teamId) {
      return res.status(400).send(new ServerResponse(false, null, "Authentication required."));
    }

    const isAdmin = req.user?.is_admin || req.user?.owner;

    const data = await TaskTimeApprovalService.getProjectReports({
      teamId,
      userId,
      isAdmin,
      employeeId: employee_id as string,
      projectId: project_id as string,
      status: status as string,
      startDate: start_date as string,
      endDate: end_date as string,
      search: search as string,
    });

    return res.status(200).send(new ServerResponse(true, data));
  }

  /**
   * Export Reports as CSV (GET /reports/export/csv)
   */
  @HandleExceptions()
  public static async exportReportsCSV(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<void> {
    const userId = req.user?.id;
    const teamId = req.user?.team_id;
    const { type = "team", employee_id, project_id, status, start_date, end_date, search } = req.query;

    if (!userId || !teamId) {
      res.status(400).send(new ServerResponse(false, null, "Authentication required."));
      return;
    }

    const isAdmin = req.user?.is_admin || req.user?.owner;
    const filterParams = {
      teamId,
      userId,
      isAdmin,
      employeeId: employee_id as string,
      projectId: project_id as string,
      status: status as string,
      startDate: start_date as string,
      endDate: end_date as string,
      search: search as string,
    };

    const Excel = (await import("exceljs")).default;
    const workbook = new Excel.Workbook();
    const sheet = workbook.addWorksheet("Approval Report");
    const exportDate = new Date().toISOString().split("T")[0];

    if (type === "employee") {
      const rows = await TaskTimeApprovalService.getEmployeeReports(filterParams);
      sheet.columns = [
        { header: "Employee", key: "name", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Role", key: "role", width: 15 },
        { header: "Tasks Completed", key: "completed", width: 18 },
        { header: "Total Tasks", key: "total_tasks", width: 15 },
        { header: "Estimated Time", key: "estimated", width: 18 },
        { header: "Recorded Time", key: "recorded", width: 18 },
        { header: "Approved Time", key: "approved", width: 18 },
        { header: "Adjustment", key: "adjustment", width: 18 },
        { header: "Avg Variance (%)", key: "variance", width: 18 },
        { header: "Tasks > Estimate", key: "over_estimate", width: 18 },
        { header: "Tasks > Maximum", key: "over_max", width: 18 },
      ];

      for (const r of rows) {
        sheet.addRow({
          name: r.name,
          email: r.email,
          role: r.role_name,
          completed: r.tasks_completed_count,
          total_tasks: r.total_tasks_count,
          estimated: TaskTimeApprovalService.formatDurationString(r.estimated_seconds),
          recorded: TaskTimeApprovalService.formatDurationString(r.recorded_seconds),
          approved: TaskTimeApprovalService.formatDurationString(r.approved_seconds),
          adjustment: TaskTimeApprovalService.formatDurationString(r.adjustment_seconds),
          variance: `${r.average_variance_percentage > 0 ? "+" : ""}${r.average_variance_percentage}%`,
          over_estimate: r.tasks_above_estimate_count,
          over_max: r.tasks_above_maximum_count,
        });
      }
    } else if (type === "project") {
      const rows = await TaskTimeApprovalService.getProjectReports(filterParams);
      sheet.columns = [
        { header: "Project", key: "name", width: 30 },
        { header: "Project Key", key: "key", width: 15 },
        { header: "Tasks Count", key: "tasks", width: 15 },
        { header: "Estimated Time", key: "estimated", width: 18 },
        { header: "Recorded Time", key: "recorded", width: 18 },
        { header: "Approved Time", key: "approved", width: 18 },
        { header: "Difference", key: "difference", width: 18 },
        { header: "Variance (%)", key: "variance", width: 18 },
        { header: "Tasks > Estimate", key: "over_estimate", width: 18 },
        { header: "Tasks > Maximum", key: "over_max", width: 18 },
      ];

      for (const r of rows) {
        sheet.addRow({
          name: r.project_name,
          key: r.project_key,
          tasks: r.tasks_count,
          estimated: TaskTimeApprovalService.formatDurationString(r.estimated_seconds),
          recorded: TaskTimeApprovalService.formatDurationString(r.recorded_seconds),
          approved: TaskTimeApprovalService.formatDurationString(r.approved_seconds),
          difference: TaskTimeApprovalService.formatDurationString(r.difference_seconds),
          variance: `${r.variance_percentage > 0 ? "+" : ""}${r.variance_percentage}%`,
          over_estimate: r.tasks_above_estimate_count,
          over_max: r.tasks_above_maximum_count,
        });
      }
    } else {
      // Default: team
      const rows = await TaskTimeApprovalService.getTeamReports(filterParams);
      sheet.columns = [
        { header: "Employee", key: "name", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Role", key: "role", width: 15 },
        { header: "Tasks Count", key: "tasks", width: 15 },
        { header: "Estimated Time", key: "estimated", width: 18 },
        { header: "Recorded Time", key: "recorded", width: 18 },
        { header: "Approved Time", key: "approved", width: 18 },
        { header: "Difference", key: "difference", width: 18 },
        { header: "Variance (%)", key: "variance", width: 18 },
        { header: "Approved", key: "approved_count", width: 12 },
        { header: "Adjusted", key: "adjusted_count", width: 12 },
        { header: "Rejected", key: "rejected_count", width: 12 },
        { header: "Pending", key: "pending_count", width: 12 },
      ];

      for (const r of rows) {
        sheet.addRow({
          name: r.name,
          email: r.email,
          role: r.role_name,
          tasks: r.tasks_count,
          estimated: TaskTimeApprovalService.formatDurationString(r.estimated_seconds),
          recorded: TaskTimeApprovalService.formatDurationString(r.recorded_seconds),
          approved: TaskTimeApprovalService.formatDurationString(r.approved_seconds),
          difference: TaskTimeApprovalService.formatDurationString(r.difference_seconds),
          variance: `${r.variance_percentage > 0 ? "+" : ""}${r.variance_percentage}%`,
          approved_count: r.approved_count,
          adjusted_count: r.adjusted_count,
          rejected_count: r.rejected_count,
          pending_count: r.pending_count,
        });
      }
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=approval-${type}-report-${exportDate}.csv`);

    await workbook.csv.write(res);
    res.end();
  }

  /**
   * Export Reports as Excel (GET /reports/export/excel)
   */
  @HandleExceptions()
  public static async exportReportsExcel(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<void> {
    const userId = req.user?.id;
    const teamId = req.user?.team_id;
    const { type = "team", employee_id, project_id, status, start_date, end_date, search } = req.query;

    if (!userId || !teamId) {
      res.status(400).send(new ServerResponse(false, null, "Authentication required."));
      return;
    }

    const isAdmin = req.user?.is_admin || req.user?.owner;
    const filterParams = {
      teamId,
      userId,
      isAdmin,
      employeeId: employee_id as string,
      projectId: project_id as string,
      status: status as string,
      startDate: start_date as string,
      endDate: end_date as string,
      search: search as string,
    };

    const Excel = (await import("exceljs")).default;
    const workbook = new Excel.Workbook();
    const sheet = workbook.addWorksheet("Approval Report");
    const exportDate = new Date().toISOString().split("T")[0];

    sheet.getRow(1).font = { bold: true };

    if (type === "employee") {
      const rows = await TaskTimeApprovalService.getEmployeeReports(filterParams);
      sheet.columns = [
        { header: "Employee", key: "name", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Role", key: "role", width: 15 },
        { header: "Tasks Completed", key: "completed", width: 18 },
        { header: "Total Tasks", key: "total_tasks", width: 15 },
        { header: "Estimated Time", key: "estimated", width: 18 },
        { header: "Recorded Time", key: "recorded", width: 18 },
        { header: "Approved Time", key: "approved", width: 18 },
        { header: "Adjustment", key: "adjustment", width: 18 },
        { header: "Avg Variance (%)", key: "variance", width: 18 },
        { header: "Tasks > Estimate", key: "over_estimate", width: 18 },
        { header: "Tasks > Maximum", key: "over_max", width: 18 },
      ];

      for (const r of rows) {
        sheet.addRow({
          name: r.name,
          email: r.email,
          role: r.role_name,
          completed: r.tasks_completed_count,
          total_tasks: r.total_tasks_count,
          estimated: TaskTimeApprovalService.formatDurationString(r.estimated_seconds),
          recorded: TaskTimeApprovalService.formatDurationString(r.recorded_seconds),
          approved: TaskTimeApprovalService.formatDurationString(r.approved_seconds),
          adjustment: TaskTimeApprovalService.formatDurationString(r.adjustment_seconds),
          variance: `${r.average_variance_percentage > 0 ? "+" : ""}${r.average_variance_percentage}%`,
          over_estimate: r.tasks_above_estimate_count,
          over_max: r.tasks_above_maximum_count,
        });
      }
    } else if (type === "project") {
      const rows = await TaskTimeApprovalService.getProjectReports(filterParams);
      sheet.columns = [
        { header: "Project", key: "name", width: 30 },
        { header: "Project Key", key: "key", width: 15 },
        { header: "Tasks Count", key: "tasks", width: 15 },
        { header: "Estimated Time", key: "estimated", width: 18 },
        { header: "Recorded Time", key: "recorded", width: 18 },
        { header: "Approved Time", key: "approved", width: 18 },
        { header: "Difference", key: "difference", width: 18 },
        { header: "Variance (%)", key: "variance", width: 18 },
        { header: "Tasks > Estimate", key: "over_estimate", width: 18 },
        { header: "Tasks > Maximum", key: "over_max", width: 18 },
      ];

      for (const r of rows) {
        sheet.addRow({
          name: r.project_name,
          key: r.project_key,
          tasks: r.tasks_count,
          estimated: TaskTimeApprovalService.formatDurationString(r.estimated_seconds),
          recorded: TaskTimeApprovalService.formatDurationString(r.recorded_seconds),
          approved: TaskTimeApprovalService.formatDurationString(r.approved_seconds),
          difference: TaskTimeApprovalService.formatDurationString(r.difference_seconds),
          variance: `${r.variance_percentage > 0 ? "+" : ""}${r.variance_percentage}%`,
          over_estimate: r.tasks_above_estimate_count,
          over_max: r.tasks_above_maximum_count,
        });
      }
    } else {
      const rows = await TaskTimeApprovalService.getTeamReports(filterParams);
      sheet.columns = [
        { header: "Employee", key: "name", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Role", key: "role", width: 15 },
        { header: "Tasks Count", key: "tasks", width: 15 },
        { header: "Estimated Time", key: "estimated", width: 18 },
        { header: "Recorded Time", key: "recorded", width: 18 },
        { header: "Approved Time", key: "approved", width: 18 },
        { header: "Difference", key: "difference", width: 18 },
        { header: "Variance (%)", key: "variance", width: 18 },
        { header: "Approved", key: "approved_count", width: 12 },
        { header: "Adjusted", key: "adjusted_count", width: 12 },
        { header: "Rejected", key: "rejected_count", width: 12 },
        { header: "Pending", key: "pending_count", width: 12 },
      ];

      for (const r of rows) {
        sheet.addRow({
          name: r.name,
          email: r.email,
          role: r.role_name,
          tasks: r.tasks_count,
          estimated: TaskTimeApprovalService.formatDurationString(r.estimated_seconds),
          recorded: TaskTimeApprovalService.formatDurationString(r.recorded_seconds),
          approved: TaskTimeApprovalService.formatDurationString(r.approved_seconds),
          difference: TaskTimeApprovalService.formatDurationString(r.difference_seconds),
          variance: `${r.variance_percentage > 0 ? "+" : ""}${r.variance_percentage}%`,
          approved_count: r.approved_count,
          adjusted_count: r.adjusted_count,
          rejected_count: r.rejected_count,
          pending_count: r.pending_count,
        });
      }
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=approval-${type}-report-${exportDate}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  }
}



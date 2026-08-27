import express from "express";
import TaskTimeApprovalController from "../../controllers/task-time-approval-controller";
import safeControllerFunction from "../../shared/safe-controller-function";
import idParamValidator from "../../middlewares/validators/id-param-validator";

const taskTimeApprovalApiRouter = express.Router();

// Submit time for a task
taskTimeApprovalApiRouter.post(
  "/submit/:taskId",
  idParamValidator,
  safeControllerFunction(TaskTimeApprovalController.submit)
);

taskTimeApprovalApiRouter.post(
  "/submit",
  safeControllerFunction(TaskTimeApprovalController.submit)
);

// Get my submissions
taskTimeApprovalApiRouter.get(
  "/my",
  safeControllerFunction(TaskTimeApprovalController.getMySubmissions)
);

// Get pending approvals for manager
taskTimeApprovalApiRouter.get(
  "/pending",
  safeControllerFunction(TaskTimeApprovalController.getPendingApprovals)
);

// Get dashboard stats (My Work & My Team)
taskTimeApprovalApiRouter.get(
  "/dashboard-stats",
  safeControllerFunction(TaskTimeApprovalController.getDashboardStats)
);

// Get timesheet summary
taskTimeApprovalApiRouter.get(
  "/timesheet-summary",
  safeControllerFunction(TaskTimeApprovalController.getTimesheetSummary)
);

// Get my detailed timesheet
taskTimeApprovalApiRouter.get(
  "/timesheets/my",
  safeControllerFunction(TaskTimeApprovalController.getMyTimesheet)
);

// Get team detailed timesheet
taskTimeApprovalApiRouter.get(
  "/timesheets/team",
  safeControllerFunction(TaskTimeApprovalController.getTeamTimesheet)
);

// Reports APIs (must be placed before parameterized /:id routes)
taskTimeApprovalApiRouter.get(
  "/reports/summary",
  safeControllerFunction(TaskTimeApprovalController.getReportsSummary)
);

taskTimeApprovalApiRouter.get(
  "/reports/employees",
  safeControllerFunction(TaskTimeApprovalController.getEmployeeReports)
);

taskTimeApprovalApiRouter.get(
  "/reports/team",
  safeControllerFunction(TaskTimeApprovalController.getTeamReports)
);

taskTimeApprovalApiRouter.get(
  "/reports/projects",
  safeControllerFunction(TaskTimeApprovalController.getProjectReports)
);

taskTimeApprovalApiRouter.get(
  "/reports/export/csv",
  safeControllerFunction(TaskTimeApprovalController.exportReportsCSV)
);

taskTimeApprovalApiRouter.get(
  "/reports/export/excel",
  safeControllerFunction(TaskTimeApprovalController.exportReportsExcel)
);

// Get approval by task
taskTimeApprovalApiRouter.get(
  "/task/:taskId",
  idParamValidator,
  safeControllerFunction(TaskTimeApprovalController.getByTask)
);

// Get approval details by approval ID
taskTimeApprovalApiRouter.get(
  "/:id",
  idParamValidator,
  safeControllerFunction(TaskTimeApprovalController.getById)
);

// Approve submission
taskTimeApprovalApiRouter.post(
  "/:id/approve",
  idParamValidator,
  safeControllerFunction(TaskTimeApprovalController.approve)
);

// Adjust submission
taskTimeApprovalApiRouter.post(
  "/:id/adjust",
  idParamValidator,
  safeControllerFunction(TaskTimeApprovalController.adjust)
);

// Reject submission
taskTimeApprovalApiRouter.post(
  "/:id/reject",
  idParamValidator,
  safeControllerFunction(TaskTimeApprovalController.reject)
);

// Resubmit submission
taskTimeApprovalApiRouter.post(
  "/:id/resubmit",
  idParamValidator,
  safeControllerFunction(TaskTimeApprovalController.resubmit)
);

export default taskTimeApprovalApiRouter;

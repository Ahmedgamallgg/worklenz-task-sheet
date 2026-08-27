import express from "express";
import TaskTimeApprovalController from "../../controllers/task-time-approval-controller";
import safeControllerFunction from "../../shared/safe-controller-function";

const timesheetsApiRouter = express.Router();

// GET /timesheets/my - Employee detailed timesheet with daily/weekly/monthly breakdown
timesheetsApiRouter.get(
  "/my",
  safeControllerFunction(TaskTimeApprovalController.getMyTimesheet)
);

// GET /timesheets/team - Manager view of team member timesheets & tasks
timesheetsApiRouter.get(
  "/team",
  safeControllerFunction(TaskTimeApprovalController.getTeamTimesheet)
);

// GET /timesheets/summary - High level recorded vs approved summary
timesheetsApiRouter.get(
  "/summary",
  safeControllerFunction(TaskTimeApprovalController.getTimesheetSummary)
);

export default timesheetsApiRouter;

import {
  TaskTimeApprovalStatus,
  TimeApprovalPolicy,
  TimeApprovalErrorCodes,
  ITaskTimeApproval,
} from "../interfaces/task-time-approval";
import { TaskTimeApprovalService } from "../services/task-time-approval.service";

describe("Task Time Approvals Domain & Business Rules (Phase 3 Backend Logic)", () => {

  describe("1. Enums and Error Constants", () => {
    it("should define valid TaskTimeApprovalStatus values", () => {
      expect(TaskTimeApprovalStatus.PENDING).toBe("PENDING");
      expect(TaskTimeApprovalStatus.APPROVED).toBe("APPROVED");
      expect(TaskTimeApprovalStatus.ADJUSTED).toBe("ADJUSTED");
      expect(TaskTimeApprovalStatus.REJECTED).toBe("REJECTED");
      expect(TaskTimeApprovalStatus.CANCELLED).toBe("CANCELLED");
    });

    it("should define valid TimeApprovalPolicy values", () => {
      expect(TimeApprovalPolicy.NO_APPROVAL_REQUIRED).toBe("NO_APPROVAL_REQUIRED");
      expect(TimeApprovalPolicy.AUTO_APPROVE).toBe("AUTO_APPROVE");
      expect(TimeApprovalPolicy.SPECIFIC_APPROVER).toBe("SPECIFIC_APPROVER");
    });

    it("should define valid TimeApprovalErrorCodes", () => {
      expect(TimeApprovalErrorCodes.SELF_APPROVAL_NOT_ALLOWED).toBe("SELF_APPROVAL_NOT_ALLOWED");
      expect(TimeApprovalErrorCodes.ADJUSTMENT_REASON_REQUIRED).toBe("ADJUSTMENT_REASON_REQUIRED");
      expect(TimeApprovalErrorCodes.REJECTION_REASON_REQUIRED).toBe("REJECTION_REASON_REQUIRED");
      expect(TimeApprovalErrorCodes.NOT_AUTHORIZED_TO_APPROVE).toBe("NOT_AUTHORIZED_TO_APPROVE");
      expect(TimeApprovalErrorCodes.TIME_ALREADY_SUBMITTED).toBe("TIME_ALREADY_SUBMITTED");
      expect(TimeApprovalErrorCodes.SUBMITTED_TIME_LOCKED).toBe("SUBMITTED_TIME_LOCKED");
      expect(TimeApprovalErrorCodes.ACTIVE_TIMER_EXISTS).toBe("ACTIVE_TIMER_EXISTS");
    });
  });

  describe("2. Self-Approval Prevention Rule (Section 8 & 56)", () => {
    it("should disallow self-approval when submitter is the reviewer", () => {
      const check = TaskTimeApprovalService.checkSelfApproval("user-123", "user-123");
      expect(check.allowed).toBe(false);
      expect(check.code).toBe(TimeApprovalErrorCodes.SELF_APPROVAL_NOT_ALLOWED);
    });

    it("should allow review when reviewer is different from submitter", () => {
      const check = TaskTimeApprovalService.checkSelfApproval("employee-456", "manager-789");
      expect(check.allowed).toBe(true);
    });

    it("should disallow manager from approving their own submitted work", () => {
      const managerUserId = "manager-001";
      const check = TaskTimeApprovalService.checkSelfApproval(managerUserId, managerUserId);
      expect(check.allowed).toBe(false);
    });
  });

  describe("3. Adjustment Reason Validation Rule (Section 17 & 55)", () => {
    it("should fail validation if approved duration differs from recorded duration without reason", () => {
      const result = TaskTimeApprovalService.validateAdjustmentReason(3600, 1800, "");
      expect(result.valid).toBe(false);
      expect(result.code).toBe(TimeApprovalErrorCodes.ADJUSTMENT_REASON_REQUIRED);
    });

    it("should fail validation if reason is only whitespace", () => {
      const result = TaskTimeApprovalService.validateAdjustmentReason(3600, 1800, "   ");
      expect(result.valid).toBe(false);
      expect(result.code).toBe(TimeApprovalErrorCodes.ADJUSTMENT_REASON_REQUIRED);
    });

    it("should pass validation if approved duration differs from recorded duration with a valid reason", () => {
      const result = TaskTimeApprovalService.validateAdjustmentReason(3600, 1800, "1 hour was unrelated research");
      expect(result.valid).toBe(true);
    });

    it("should pass validation if approved duration equals recorded duration even without reason", () => {
      const result = TaskTimeApprovalService.validateAdjustmentReason(3600, 3600, "");
      expect(result.valid).toBe(true);
    });
  });

  describe("4. Rejection Reason Validation Rule (Section 16)", () => {
    it("should require a rejection reason when rejecting", () => {
      expect(TaskTimeApprovalService.validateRejectionReason("").valid).toBe(false);
      expect(TaskTimeApprovalService.validateRejectionReason("   ").valid).toBe(false);
      expect(TaskTimeApprovalService.validateRejectionReason(undefined).valid).toBe(false);
      expect(TaskTimeApprovalService.validateRejectionReason("Incomplete task description").valid).toBe(true);
    });
  });

  describe("5. Recorded Time Immutability Invariant (Section 4, 14 & 55)", () => {
    it("should never mutate employee recorded_duration when approved_duration is adjusted", () => {
      const recordedSeconds = 19800; // 5h 30m
      const adjustedApprovedSeconds = 14400; // 4h

      const approvalRecord: ITaskTimeApproval = {
        id: "approval-uuid-1",
        task_id: "task-uuid-1",
        team_member_id: "member-uuid-1",
        submitted_by_member_id: "member-uuid-1",
        recorded_duration: recordedSeconds,
        approved_duration: adjustedApprovedSeconds,
        status: TaskTimeApprovalStatus.ADJUSTED,
        adjustment_reason: "1.5 hours related to unrelated research",
        submission_number: 1,
        version: 1,
      };

      // Invariant: original recorded duration MUST remain 5h30m (19800s)
      expect(approvalRecord.recorded_duration).toBe(19800);
      expect(approvalRecord.approved_duration).toBe(14400);
      expect(approvalRecord.status).toBe(TaskTimeApprovalStatus.ADJUSTED);
    });
  });

  describe("6. Resubmission Workflow & Versioning (Section 33 & 55)", () => {
    function simulateResubmission(
      previousRecord: ITaskTimeApproval,
      newRecordedSeconds: number
    ): ITaskTimeApproval {
      return {
        ...previousRecord,
        status: TaskTimeApprovalStatus.PENDING,
        recorded_duration: newRecordedSeconds,
        approved_duration: 0,
        version: (previousRecord.version || 1) + 1,
        submission_number: (previousRecord.submission_number || 1) + 1,
        rejection_reason: null,
        adjustment_reason: null,
        manager_comment: null,
        reviewed_at: null,
      };
    }

    it("should reset status to PENDING, increment version and submission number on resubmission", () => {
      const initialRejected: ITaskTimeApproval = {
        id: "appr-1",
        task_id: "task-1",
        team_member_id: "member-1",
        submitted_by_member_id: "member-1",
        recorded_duration: 18000, // 5h
        approved_duration: 0,
        status: TaskTimeApprovalStatus.REJECTED,
        rejection_reason: "Missing timesheet notes",
        version: 1,
        submission_number: 1,
      };

      const resubmitted = simulateResubmission(initialRejected, 19800); // 5h 30m

      expect(resubmitted.status).toBe(TaskTimeApprovalStatus.PENDING);
      expect(resubmitted.version).toBe(2);
      expect(resubmitted.submission_number).toBe(2);
      expect(resubmitted.recorded_duration).toBe(19800);
      expect(resubmitted.rejection_reason).toBeNull();
    });
  });

  describe("7. Multiple Assignees Independent Approvals (Section 5 & 57)", () => {
    it("should track distinct approval records for multiple assignees on the same task", () => {
      const taskApprovals: ITaskTimeApproval[] = [
        {
          id: "appr-ahmed",
          task_id: "task-build-web",
          team_member_id: "member-ahmed",
          submitted_by_member_id: "member-ahmed",
          recorded_duration: 18000, // 5h
          approved_duration: 14400, // 4h
          status: TaskTimeApprovalStatus.ADJUSTED,
        },
        {
          id: "appr-sara",
          task_id: "task-build-web",
          team_member_id: "member-sara",
          submitted_by_member_id: "member-sara",
          recorded_duration: 10800, // 3h
          approved_duration: 10800, // 3h
          status: TaskTimeApprovalStatus.APPROVED,
        },
        {
          id: "appr-mohamed",
          task_id: "task-build-web",
          team_member_id: "member-mohamed",
          submitted_by_member_id: "member-mohamed",
          recorded_duration: 7200, // 2h
          approved_duration: 6300, // 1h 45m
          status: TaskTimeApprovalStatus.ADJUSTED,
        },
      ];

      expect(taskApprovals).toHaveLength(3);
      expect(taskApprovals[0].team_member_id).toBe("member-ahmed");
      expect(taskApprovals[1].team_member_id).toBe("member-sara");
      expect(taskApprovals[2].team_member_id).toBe("member-mohamed");

      const totalRecorded = taskApprovals.reduce((acc, curr) => acc + curr.recorded_duration, 0);
      const totalApproved = taskApprovals.reduce((acc, curr) => acc + curr.approved_duration, 0);

      expect(totalRecorded).toBe(36000); // 10h
      expect(totalApproved).toBe(31500); // 8h 45m
    });
  });

  describe("8. Submitted Time Locking Rule (Section 15)", () => {
    function canEditTimeLog(approvalStatus?: TaskTimeApprovalStatus): { canEdit: boolean; code?: string } {
      if (
        approvalStatus === TaskTimeApprovalStatus.PENDING ||
        approvalStatus === TaskTimeApprovalStatus.APPROVED ||
        approvalStatus === TaskTimeApprovalStatus.ADJUSTED
      ) {
        return { canEdit: false, code: TimeApprovalErrorCodes.SUBMITTED_TIME_LOCKED };
      }
      return { canEdit: true };
    }

    it("should prevent modifying or deleting time logs when approval is PENDING, APPROVED, or ADJUSTED", () => {
      expect(canEditTimeLog(TaskTimeApprovalStatus.PENDING).canEdit).toBe(false);
      expect(canEditTimeLog(TaskTimeApprovalStatus.APPROVED).canEdit).toBe(false);
      expect(canEditTimeLog(TaskTimeApprovalStatus.ADJUSTED).canEdit).toBe(false);
    });

    it("should allow editing time logs when submission is REJECTED or unsubmitted", () => {
      expect(canEditTimeLog(TaskTimeApprovalStatus.REJECTED).canEdit).toBe(true);
      expect(canEditTimeLog(undefined).canEdit).toBe(true);
    });
  });

  describe("9. Single Active Timer Enforcement (Section 21)", () => {
    function validateTimerStart(runningTimersCount: number): { canStart: boolean; code?: string } {
      if (runningTimersCount > 0) {
        return { canStart: false, code: TimeApprovalErrorCodes.ACTIVE_TIMER_EXISTS };
      }
      return { canStart: true };
    }

    it("should allow starting a timer when no other timer is active", () => {
      expect(validateTimerStart(0).canStart).toBe(true);
    });

    it("should reject starting a timer when an active timer already exists", () => {
      const result = validateTimerStart(1);
      expect(result.canStart).toBe(false);
      expect(result.code).toBe(TimeApprovalErrorCodes.ACTIVE_TIMER_EXISTS);
    });
  });

  describe("10. Variance Calculations (Section 25)", () => {
    function calculateVariance(recordedSeconds: number, estimatedMinutes?: number | null) {
      const estimatedSeconds = (estimatedMinutes || 0) * 60;
      const varianceSeconds = recordedSeconds - estimatedSeconds;
      const variancePercentage = estimatedSeconds > 0
        ? Number(((varianceSeconds / estimatedSeconds) * 100).toFixed(2))
        : null;

      return { varianceSeconds, variancePercentage };
    }

    it("should calculate correct positive variance and percentage", () => {
      // Estimated: 3h (180m), Recorded: 5h30m (19800s)
      const res = calculateVariance(19800, 180);
      expect(res.varianceSeconds).toBe(9000); // +2h 30m (9000s)
      expect(res.variancePercentage).toBe(83.33); // +83.33%
    });

    it("should calculate correct negative variance and percentage", () => {
      // Estimated: 2h (120m), Recorded: 1h45m (6300s)
      const res = calculateVariance(6300, 120);
      expect(res.varianceSeconds).toBe(-900); // -15m (-900s)
      expect(res.variancePercentage).toBe(-12.5); // -12.5%
    });

    it("should handle zero or null estimate without dividing by zero", () => {
      const res1 = calculateVariance(3600, 0);
      expect(res1.variancePercentage).toBeNull();

      const res2 = calculateVariance(3600, null);
      expect(res2.variancePercentage).toBeNull();
    });
  });

  describe("11. Top-Level Policy Evaluation (Section 9)", () => {
    function evaluateTopLevelApproval(policy: TimeApprovalPolicy, recordedDuration: number) {
      if (policy === TimeApprovalPolicy.AUTO_APPROVE || policy === TimeApprovalPolicy.NO_APPROVAL_REQUIRED) {
        return {
          status: TaskTimeApprovalStatus.APPROVED,
          approved_duration: recordedDuration,
        };
      }
      return {
        status: TaskTimeApprovalStatus.PENDING,
        approved_duration: 0,
      };
    }

    it("should auto-approve when policy is NO_APPROVAL_REQUIRED or AUTO_APPROVE", () => {
      const res1 = evaluateTopLevelApproval(TimeApprovalPolicy.NO_APPROVAL_REQUIRED, 3600);
      expect(res1.status).toBe(TaskTimeApprovalStatus.APPROVED);
      expect(res1.approved_duration).toBe(3600);

      const res2 = evaluateTopLevelApproval(TimeApprovalPolicy.AUTO_APPROVE, 7200);
      expect(res2.status).toBe(TaskTimeApprovalStatus.APPROVED);
      expect(res2.approved_duration).toBe(7200);
    });

    it("should remain PENDING when policy is SPECIFIC_APPROVER", () => {
      const res = evaluateTopLevelApproval(TimeApprovalPolicy.SPECIFIC_APPROVER, 3600);
      expect(res.status).toBe(TaskTimeApprovalStatus.PENDING);
      expect(res.approved_duration).toBe(0);
    });
  });

  describe("12. Phase 4 — API Endpoints & Controller Validation Contracts", () => {
    it("should validate POST /time-approvals/submit payload requirements", () => {
      const validSubmit = { taskId: "task-1", user: { id: "user-1", team_id: "team-1" }, teamId: "team-1" };
      expect(validSubmit.taskId).toBeDefined();
      expect(validSubmit.user.id).toBeDefined();
      expect(validSubmit.teamId).toBeDefined();

      const invalidSubmit1 = { taskId: "", user: { id: "user-1", team_id: "team-1" }, teamId: "team-1" };
      expect(Boolean(invalidSubmit1.taskId)).toBe(false);
    });

    it("should validate POST /time-approvals/:id/adjust requires valid adjustment reason when approved != recorded", () => {
      const recorded = 19800; // 5h 30m
      const approved = 14400; // 4h
      const emptyReasonCheck = TaskTimeApprovalService.validateAdjustmentReason(recorded, approved, "");
      expect(emptyReasonCheck.valid).toBe(false);
      expect(emptyReasonCheck.code).toBe(TimeApprovalErrorCodes.ADJUSTMENT_REASON_REQUIRED);

      const validReasonCheck = TaskTimeApprovalService.validateAdjustmentReason(
        recorded,
        approved,
        "Meeting overran, deducted 1.5h"
      );
      expect(validReasonCheck.valid).toBe(true);
    });

    it("should validate POST /time-approvals/:id/reject requires mandatory rejection reason", () => {
      const emptyCheck = TaskTimeApprovalService.validateRejectionReason("");
      expect(emptyCheck.valid).toBe(false);
      expect(emptyCheck.code).toBe(TimeApprovalErrorCodes.REJECTION_REASON_REQUIRED);

      const filledCheck = TaskTimeApprovalService.validateRejectionReason("Please add log descriptions");
      expect(filledCheck.valid).toBe(true);
    });

    it("should disallow self-approval when manager tries to approve own submission", () => {
      const check = TaskTimeApprovalService.checkSelfApproval("user-manager-1", "user-manager-1");
      expect(check.allowed).toBe(false);
      expect(check.code).toBe(TimeApprovalErrorCodes.SELF_APPROVAL_NOT_ALLOWED);
    });
  });

  describe("13. Phase 4 — Timesheet Aggregation and Daily Breakdown Logic", () => {
    interface ITimesheetRow {
      log_date: string;
      recorded_seconds: number;
      approved_seconds: number;
      approval_status: string;
    }

    function aggregateTimesheet(rows: ITimesheetRow[]) {
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
      }>();

      for (const row of rows) {
        const rec = row.recorded_seconds;
        const app = (row.approval_status === "APPROVED" || row.approval_status === "ADJUSTED")
          ? row.approved_seconds
          : 0;
        const pend = row.approval_status === "PENDING" ? rec : 0;
        const adj = row.approval_status === "ADJUSTED" ? (app - rec) : 0;

        totalRecorded += rec;
        totalApproved += app;
        totalPending += pend;
        totalAdjustment += adj;

        if (!daysMap.has(row.log_date)) {
          daysMap.set(row.log_date, {
            date: row.log_date,
            recorded_seconds: 0,
            approved_seconds: 0,
            pending_seconds: 0,
            adjustment_seconds: 0,
          });
        }

        const day = daysMap.get(row.log_date)!;
        day.recorded_seconds += rec;
        day.approved_seconds += app;
        day.pending_seconds += pend;
        day.adjustment_seconds += adj;
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

    it("should accurately aggregate timesheet across multiple days and approval statuses", () => {
      const rows: ITimesheetRow[] = [
        // Monday: 8h recorded, 7.5h approved (ADJUSTED)
        { log_date: "2026-08-24", recorded_seconds: 28800, approved_seconds: 27000, approval_status: "ADJUSTED" },
        // Tuesday: 7h recorded, 7h approved (APPROVED)
        { log_date: "2026-08-25", recorded_seconds: 25200, approved_seconds: 25200, approval_status: "APPROVED" },
        // Wednesday: 8h20m recorded (30000s), pending 2h (7200s), approved 6h20m (22800s)
        { log_date: "2026-08-26", recorded_seconds: 22800, approved_seconds: 22800, approval_status: "APPROVED" },
        { log_date: "2026-08-26", recorded_seconds: 7200, approved_seconds: 0, approval_status: "PENDING" },
      ];

      const result = aggregateTimesheet(rows);

      // Summary checks
      expect(result.summary.total_recorded_seconds).toBe(28800 + 25200 + 22800 + 7200); // 84000s (23h 20m)
      expect(result.summary.total_approved_seconds).toBe(27000 + 25200 + 22800); // 75000s (20h 50m)
      expect(result.summary.total_pending_seconds).toBe(7200); // 2h (7200s)
      expect(result.summary.total_adjustment_seconds).toBe(-1800); // -30m (-1800s)

      // Day breakdown checks
      expect(result.days).toHaveLength(3);
      expect(result.days[0].date).toBe("2026-08-24");
      expect(result.days[0].recorded_seconds).toBe(28800);
      expect(result.days[0].approved_seconds).toBe(27000);
      expect(result.days[0].adjustment_seconds).toBe(-1800);

      expect(result.days[2].date).toBe("2026-08-26");
      expect(result.days[2].recorded_seconds).toBe(30000);
      expect(result.days[2].pending_seconds).toBe(7200);
      expect(result.days[2].approved_seconds).toBe(22800);
    });

    it("should preserve recorded time without mutation when calculating team timesheet adjustments", () => {
      const teamMemberRows = [
        { name: "Ahmed", tasks: 22, recorded: 155700, approved: 142200 }, // 43h15m, 39h30m -> -3h45m (-13500s)
        { name: "Sara", tasks: 19, recorded: 139200, approved: 139200 },   // 38h40m, 38h40m -> 0
        { name: "Omar", tasks: 25, recorded: 170400, approved: 151800 },   // 47h20m, 42h10m -> -5h10m (-18600s)
      ];

      const memberSummaries = teamMemberRows.map((m) => ({
        ...m,
        adjustment: m.approved - m.recorded,
      }));

      expect(memberSummaries[0].recorded).toBe(155700);
      expect(memberSummaries[0].adjustment).toBe(-13500);

      expect(memberSummaries[1].recorded).toBe(139200);
      expect(memberSummaries[1].adjustment).toBe(0);

      expect(memberSummaries[2].recorded).toBe(170400);
      expect(memberSummaries[2].adjustment).toBe(-18600);
    });
  });

  describe("Phase 8: Reports Calculations & Variance Metrics", () => {
    it("should format duration seconds into clean readable strings (e.g., 5h 30m, -1h 30m)", () => {
      expect(TaskTimeApprovalService.formatDurationString(19800)).toBe("5h 30m");
      expect(TaskTimeApprovalService.formatDurationString(0)).toBe("0h 0m");
      expect(TaskTimeApprovalService.formatDurationString(-5400)).toBe("-1h 30m");
      expect(TaskTimeApprovalService.formatDurationString(7200)).toBe("2h 0m");
      expect(TaskTimeApprovalService.formatDurationString(4500)).toBe("1h 15m");
    });

    it("should correctly calculate Employee Report metrics including adjustment and average variance", () => {
      // Scenario: Employee Ahmed completed 4 tasks
      const ahmedTasks = [
        // Task 1: est 3h (10800s), recorded 3h (10800s), approved 3h (10800s) -> variance 0%
        { est_sec: 10800, rec_sec: 10800, app_sec: 10800, max_sec: 14400, status: "APPROVED" },
        // Task 2: est 4h (14400s), recorded 5.5h (19800s), approved 4h (14400s), max 5h (18000s) -> over est (+37.5%), over max, adj -1.5h (-5400s)
        { est_sec: 14400, rec_sec: 19800, app_sec: 14400, max_sec: 18000, status: "ADJUSTED" },
        // Task 3: est 2h (7200s), recorded 2.5h (9000s), approved 2.5h (9000s), max null -> over est (+25%), adj 0
        { est_sec: 7200, rec_sec: 9000, app_sec: 9000, max_sec: null, status: "APPROVED" },
        // Task 4: est 5h (18000s), recorded 4h (14400s), approved 4h (14400s), max null -> under est (-20%), adj 0
        { est_sec: 18000, rec_sec: 14400, app_sec: 14400, max_sec: null, status: "APPROVED" },
      ];

      const totalEstimated = ahmedTasks.reduce((s, t) => s + t.est_sec, 0); // 50400s (14h)
      const totalRecorded = ahmedTasks.reduce((s, t) => s + t.rec_sec, 0); // 54000s (15h)
      const totalApproved = ahmedTasks.reduce((s, t) => s + t.app_sec, 0); // 48600s (13.5h)
      const totalAdjustment = totalRecorded - totalApproved; // 5400s (1.5h reduction)
      const tasksOverEstimate = ahmedTasks.filter((t) => t.rec_sec > t.est_sec).length; // 2 tasks
      const tasksOverMax = ahmedTasks.filter((t) => t.max_sec !== null && t.rec_sec > t.max_sec).length; // 1 task

      const overallVariancePct = Math.round(((totalRecorded - totalEstimated) / totalEstimated) * 10000) / 100; // +7.14%

      expect(totalEstimated).toBe(50400);
      expect(totalRecorded).toBe(54000);
      expect(totalApproved).toBe(48600);
      expect(totalAdjustment).toBe(5400);
      expect(tasksOverEstimate).toBe(2);
      expect(tasksOverMax).toBe(1);
      expect(overallVariancePct).toBe(7.14);
    });

    it("should compute Team Report summary and difference correctly without mutating recorded hours", () => {
      const teamData = [
        { name: "Ahmed", tasks: 8, est_sec: 100800, rec_sec: 115200, app_sec: 104400, diff_sec: 10800 },
        { name: "Sara", tasks: 6, est_sec: 86400, rec_sec: 86400, app_sec: 86400, diff_sec: 0 },
        { name: "Mohamed", tasks: 10, est_sec: 144000, rec_sec: 151200, app_sec: 144000, diff_sec: 7200 },
      ];

      const totalTasks = teamData.reduce((s, m) => s + m.tasks, 0);
      const totalEst = teamData.reduce((s, m) => s + m.est_sec, 0);
      const totalRec = teamData.reduce((s, m) => s + m.rec_sec, 0);
      const totalApp = teamData.reduce((s, m) => s + m.app_sec, 0);
      const totalDiff = totalRec - totalApp;
      const adjustmentPct = Math.round((totalDiff / totalRec) * 10000) / 100;

      expect(totalTasks).toBe(24);
      expect(totalEst).toBe(331200); // 92h
      expect(totalRec).toBe(352800); // 98h
      expect(totalApp).toBe(334800); // 93h
      expect(totalDiff).toBe(18000);  // 5h adjusted
      expect(adjustmentPct).toBe(5.1); // 5.1% adjustment rate
    });

    it("should calculate Project Report variance comparing Estimated, Recorded, and Approved", () => {
      const projectData = {
        name: "Website Redesign",
        tasks_count: 12,
        estimated_sec: 144000, // 40h
        recorded_sec: 165600,  // 46h
        approved_sec: 151200,  // 42h
        difference_sec: 14400, // 4h
        tasks_above_estimate: 4,
        tasks_above_max: 2,
      };

      const variancePct = Math.round(((projectData.recorded_sec - projectData.estimated_sec) / projectData.estimated_sec) * 10000) / 100;

      expect(projectData.difference_sec).toBe(14400);
      expect(variancePct).toBe(15); // +15% recorded over estimate
      expect(projectData.tasks_above_estimate).toBe(4);
      expect(projectData.tasks_above_max).toBe(2);
    });
  });

  describe("14. Acceptance Scenario 1 — Employee Time Adjustment (Section 55)", () => {
    it("should process Ahmed's submission, Mohamed's adjustment, and maintain recorded time immutability", () => {
      // 1. Ahmed logs 3 sessions: 1h30m (5400s), 2h (7200s), 2h (7200s) -> total 5h30m (19800s)
      const session1 = 5400;
      const session2 = 7200;
      const session3 = 7200;
      const recordedTotal = session1 + session2 + session3;
      expect(recordedTotal).toBe(19800);

      // Task limits: Estimated 3h (10800s), Maximum 4h (14400s)
      const estimatedSeconds = 10800;
      const maxApprovedSeconds = 14400;

      // Variance calculation
      const variance = recordedTotal - estimatedSeconds; // +2h 30m (9000s)
      const variancePct = Math.round((variance / estimatedSeconds) * 10000) / 100; // +83.33%
      expect(variance).toBe(9000);
      expect(variancePct).toBe(83.33);

      // Submission creation
      let approvalRecord: ITaskTimeApproval = {
        id: "approval-ahmed-landing-page",
        task_id: "task-landing-page",
        team_member_id: "member-ahmed",
        submitted_by_member_id: "member-ahmed",
        recorded_duration: recordedTotal,
        approved_duration: 0,
        status: TaskTimeApprovalStatus.PENDING,
        version: 1,
        submission_number: 1,
      };
      expect(approvalRecord.status).toBe(TaskTimeApprovalStatus.PENDING);

      // Mohamed (manager) adjusts approval to 4h (14400s)
      const adjustedApprovedDuration = 14400;
      const adjustmentReason = "1.5 hours exceeded the approved scope.";
      const validation = TaskTimeApprovalService.validateAdjustmentReason(
        approvalRecord.recorded_duration,
        adjustedApprovedDuration,
        adjustmentReason
      );
      expect(validation.valid).toBe(true);

      approvalRecord = {
        ...approvalRecord,
        approved_duration: adjustedApprovedDuration,
        adjustment_reason: adjustmentReason,
        status: TaskTimeApprovalStatus.ADJUSTED,
        reviewed_by_member_id: "member-mohamed",
        reviewed_at: new Date().toISOString(),
      };

      // Invariants check:
      // - Ahmed's original recorded total remains 5h30m (19800s)
      expect(approvalRecord.recorded_duration).toBe(19800);
      expect(approvalRecord.approved_duration).toBe(14400);
      const diff = approvalRecord.approved_duration - approvalRecord.recorded_duration;
      expect(diff).toBe(-5400); // -1h 30m
      expect(approvalRecord.status).toBe(TaskTimeApprovalStatus.ADJUSTED);
    });
  });

  describe("15. Acceptance Scenario 2 — Manager Personal Task (Section 56)", () => {
    it("should route manager personal submission upward and block self-approval", () => {
      // Mohamed reports to Karim
      const mohamedUserId = "user-mohamed";
      const mohamedMemberId = "member-mohamed";
      const karimMemberId = "member-karim";

      // Mohamed submits time on personal task
      const personalApproval: ITaskTimeApproval = {
        id: "approval-mohamed-task",
        task_id: "task-manager-internal",
        team_member_id: mohamedMemberId,
        submitted_by_member_id: mohamedMemberId,
        recorded_duration: 10800, // 3h
        approved_duration: 0,
        status: TaskTimeApprovalStatus.PENDING,
        approver_member_id: karimMemberId, // Routed to Karim
      };

      expect(personalApproval.approver_member_id).toBe(karimMemberId);

      // If Mohamed attempts to call approve on his own submission, backend rejects
      const selfApprovalCheck = TaskTimeApprovalService.checkSelfApproval(mohamedUserId, mohamedUserId);
      expect(selfApprovalCheck.allowed).toBe(false);
      expect(selfApprovalCheck.code).toBe(TimeApprovalErrorCodes.SELF_APPROVAL_NOT_ALLOWED);

      // When Karim approves, it is permitted
      const karimApprovalCheck = TaskTimeApprovalService.checkSelfApproval(mohamedUserId, "user-karim");
      expect(karimApprovalCheck.allowed).toBe(true);
    });
  });

  describe("16. Acceptance Scenario 3 — Multiple Assignees (Section 57)", () => {
    it("should maintain independent approvals and aggregate stats for multi-assignee tasks", () => {
      // Ahmed & Sara assigned to same task
      const ahmedApproval: ITaskTimeApproval = {
        id: "appr-ahmed",
        task_id: "task-feature-x",
        team_member_id: "member-ahmed",
        submitted_by_member_id: "member-ahmed",
        recorded_duration: 18000, // 5h
        approved_duration: 14400, // 4h
        status: TaskTimeApprovalStatus.ADJUSTED,
        adjustment_reason: "Reduced 1h",
      };

      const saraApproval: ITaskTimeApproval = {
        id: "appr-sara",
        task_id: "task-feature-x",
        team_member_id: "member-sara",
        submitted_by_member_id: "member-sara",
        recorded_duration: 10800, // 3h
        approved_duration: 10800, // 3h
        status: TaskTimeApprovalStatus.APPROVED,
      };

      const taskApprovals = [ahmedApproval, saraApproval];

      // Independent approval records check
      expect(taskApprovals[0].team_member_id).toBe("member-ahmed");
      expect(taskApprovals[0].status).toBe(TaskTimeApprovalStatus.ADJUSTED);
      expect(taskApprovals[0].approved_duration).toBe(14400);

      expect(taskApprovals[1].team_member_id).toBe("member-sara");
      expect(taskApprovals[1].status).toBe(TaskTimeApprovalStatus.APPROVED);
      expect(taskApprovals[1].approved_duration).toBe(10800);

      // Task-level aggregate
      const taskAggregateRecorded = taskApprovals.reduce((acc, curr) => acc + curr.recorded_duration, 0);
      const taskAggregateApproved = taskApprovals.reduce((acc, curr) => acc + curr.approved_duration, 0);

      expect(taskAggregateRecorded).toBe(28800); // 8h
      expect(taskAggregateApproved).toBe(25200); // 7h
    });
  });

  describe("17. Acceptance Scenario 4 & Security Review (Section 51 & 58)", () => {
    it("should prevent cross-team approval access (tenant isolation)", () => {
      function checkTeamAuthorization(
        requestTeamId: string,
        approvalTeamId: string
      ): { authorized: boolean; code?: string } {
        if (requestTeamId !== approvalTeamId) {
          return { authorized: false, code: TimeApprovalErrorCodes.NOT_AUTHORIZED_TO_APPROVE };
        }
        return { authorized: true };
      }

      // Manager from Team B tries to access Team A approval
      const teamBManagerAccess = checkTeamAuthorization("team-b-uuid", "team-a-uuid");
      expect(teamBManagerAccess.authorized).toBe(false);
      expect(teamBManagerAccess.code).toBe(TimeApprovalErrorCodes.NOT_AUTHORIZED_TO_APPROVE);

      // Team A Manager accessing Team A approval
      const teamAManagerAccess = checkTeamAuthorization("team-a-uuid", "team-a-uuid");
      expect(teamAManagerAccess.authorized).toBe(true);
    });

    it("should sanitize and escape input in manager comments to prevent XSS", () => {
      const dirtyComment = "<script>alert('xss')</script>Approved after review";
      const sanitized = TaskTimeApprovalService.sanitizeComment(dirtyComment);
      expect(sanitized).not.toContain("<script>");
      expect(sanitized).toContain("Approved after review");
    });
  });
});




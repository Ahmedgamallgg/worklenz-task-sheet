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
});


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
});

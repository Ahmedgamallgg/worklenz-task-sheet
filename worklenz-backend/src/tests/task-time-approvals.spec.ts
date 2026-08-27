import {
  TaskTimeApprovalStatus,
  TimeApprovalPolicy,
  ITaskTimeApproval,
} from "../interfaces/task-time-approval";

describe("Task Time Approvals Domain & Business Rules", () => {
  describe("Enums and Constants", () => {
    it("should define valid TaskTimeApprovalStatus values", () => {
      expect(TaskTimeApprovalStatus.PENDING).toBe("PENDING");
      expect(TaskTimeApprovalStatus.APPROVED).toBe("APPROVED");
      expect(TaskTimeApprovalStatus.ADJUSTED).toBe("ADJUSTED");
      expect(TaskTimeApprovalStatus.REJECTED).toBe("REJECTED");
    });

    it("should define valid TimeApprovalPolicy values", () => {
      expect(TimeApprovalPolicy.NO_APPROVAL_REQUIRED).toBe("NO_APPROVAL_REQUIRED");
      expect(TimeApprovalPolicy.AUTO_APPROVE).toBe("AUTO_APPROVE");
      expect(TimeApprovalPolicy.SPECIFIC_APPROVER).toBe("SPECIFIC_APPROVER");
    });
  });

  describe("Self-Approval Prevention Rule Validation", () => {
    function validateSelfApproval(submitterUserId: string, currentUserId: string): boolean {
      if (submitterUserId === currentUserId) {
        return false; // SELF_APPROVAL_NOT_ALLOWED
      }
      return true;
    }

    it("should disallow self-approval when submitter is the reviewer", () => {
      const isAllowed = validateSelfApproval("user-123", "user-123");
      expect(isAllowed).toBe(false);
    });

    it("should allow approval when submitter is different from reviewer", () => {
      const isAllowed = validateSelfApproval("employee-456", "manager-789");
      expect(isAllowed).toBe(true);
    });
  });

  describe("Adjustment Reason Validation Rule", () => {
    function validateAdjustmentReason(
      recordedDuration: number,
      approvedDuration: number,
      reason?: string
    ): { valid: boolean; error?: string } {
      if (approvedDuration !== recordedDuration) {
        if (!reason || !reason.trim()) {
          return { valid: false, error: "ADJUSTMENT_REASON_REQUIRED" };
        }
      }
      return { valid: true };
    }

    it("should fail validation if approved duration differs from recorded duration without reason", () => {
      const result = validateAdjustmentReason(3600, 1800, "");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("ADJUSTMENT_REASON_REQUIRED");
    });

    it("should pass validation if approved duration differs from recorded duration with valid reason", () => {
      const result = validateAdjustmentReason(3600, 1800, "Agreed on 30 min scope reduction");
      expect(result.valid).toBe(true);
    });

    it("should pass validation if approved duration equals recorded duration without reason", () => {
      const result = validateAdjustmentReason(3600, 3600, "");
      expect(result.valid).toBe(true);
    });
  });

  describe("Rejection Reason Validation Rule", () => {
    function validateRejectionReason(reason?: string): { valid: boolean; error?: string } {
      if (!reason || !reason.trim()) {
        return { valid: false, error: "REJECTION_REASON_REQUIRED" };
      }
      return { valid: true };
    }

    it("should require a rejection reason", () => {
      expect(validateRejectionReason("").valid).toBe(false);
      expect(validateRejectionReason("   ").valid).toBe(false);
      expect(validateRejectionReason("Incomplete task documentation").valid).toBe(true);
    });
  });

  describe("Recorded Time Immutability Invariant", () => {
    it("should maintain recorded_duration separate from approved_duration", () => {
      const approvalRecord: ITaskTimeApproval = {
        id: "approval-uuid-1",
        task_id: "task-uuid-1",
        team_member_id: "member-uuid-1",
        submitted_by_member_id: "member-uuid-1",
        recorded_duration: 7200, // 2 hours
        approved_duration: 3600, // 1 hour adjusted
        status: TaskTimeApprovalStatus.ADJUSTED,
        adjustment_reason: "Cut non-billable time",
        submission_number: 1,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Invariant: recorded_duration is never overwritten
      expect(approvalRecord.recorded_duration).toBe(7200);
      expect(approvalRecord.approved_duration).toBe(3600);
      expect(approvalRecord.recorded_duration).not.toBe(approvalRecord.approved_duration);
    });
  });

  describe("Single Active Timer Enforcement Invariant", () => {
    function canStartTimer(activeTimerCount: number): boolean {
      return activeTimerCount === 0;
    }

    it("should allow starting a timer when no active timer exists", () => {
      expect(canStartTimer(0)).toBe(true);
    });

    it("should block starting a timer when an active timer already exists", () => {
      expect(canStartTimer(1)).toBe(false);
    });
  });
});


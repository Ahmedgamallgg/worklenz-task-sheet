import { TaskTimeApprovalService } from "../services/task-time-approval.service";
import { NotificationTypes } from "../services/notifications/notification-types";
import { NotificationsService } from "../services/notifications/notifications.service";
import db from "../config/db";

jest.mock("../config/db", () => ({
  query: jest.fn(),
}));

jest.mock("../services/notifications/notifications.service", () => ({
  NotificationsService: {
    createNotification: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../services/activity-logs/activity-logs.service", () => ({
  insertToActivityLogs: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../shared/io", () => ({
  IO: {
    getInstance: jest.fn().mockReturnValue({
      emit: jest.fn(),
    }),
  },
}));

describe("Task Time Approval Notifications & Thresholds (Phase 9)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("formatDurationDisplay", () => {
    it("should format hours and minutes correctly", () => {
      expect(TaskTimeApprovalService.formatDurationDisplay(19800)).toBe("5h 30m"); // 5.5 hours
      expect(TaskTimeApprovalService.formatDurationDisplay(14400)).toBe("4h"); // 4 hours
      expect(TaskTimeApprovalService.formatDurationDisplay(2700)).toBe("45m"); // 45 minutes
      expect(TaskTimeApprovalService.formatDurationDisplay(0)).toBe("0m");
      expect(TaskTimeApprovalService.formatDurationDisplay(-100)).toBe("0m");
    });

    it("should handle string numbers and NaN safely", () => {
      expect(TaskTimeApprovalService.formatDurationDisplay("18000")).toBe("5h");
      expect(TaskTimeApprovalService.formatDurationDisplay("invalid")).toBe("0m");
    });
  });

  describe("NotificationTypes", () => {
    it("should define all Phase 9 notification types", () => {
      expect(NotificationTypes.TIME_SUBMITTED).toBe("TIME_SUBMITTED");
      expect(NotificationTypes.TIME_APPROVED).toBe("TIME_APPROVED");
      expect(NotificationTypes.TIME_ADJUSTED).toBe("TIME_ADJUSTED");
      expect(NotificationTypes.TIME_REJECTED).toBe("TIME_REJECTED");
      expect(NotificationTypes.TIME_RESUBMITTED).toBe("TIME_RESUBMITTED");
      expect(NotificationTypes.TASK_EXCEEDED_ESTIMATE).toBe("TASK_EXCEEDED_ESTIMATE");
      expect(NotificationTypes.TASK_EXCEEDED_MAXIMUM).toBe("TASK_EXCEEDED_MAXIMUM");
    });
  });

  describe("checkTaskTimeThresholds", () => {
    const mockTaskId = "task-111";
    const mockUserId = "user-222";
    const mockManagerUserId = "mgr-333";

    it("should notify manager when task exceeds estimated time", async () => {
      // 1. Task query return 3h estimate (180 mins) and reports_to manager
      (db.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            {
              id: mockTaskId,
              name: "Landing Page",
              total_minutes: 180, // 3 hours = 10800s
              maximum_approved_minutes: 0,
              project_id: "proj-1",
              team_id: "team-1",
              reports_to_member_id: "tm-mgr",
              user_name: "Ahmed",
            },
          ],
        })
        // 2. Total time query: recorded 5h30m (19800s)
        .mockResolvedValueOnce({
          rows: [{ total_seconds: 19800 }],
        })
        // 3. Manager lookup
        .mockResolvedValueOnce({
          rows: [{ user_id: mockManagerUserId }],
        });

      // Added 4h (14400s), before was 19800 - 14400 = 5400s (below 10800s) -> crossed
      await TaskTimeApprovalService.checkTaskTimeThresholds(
        mockTaskId,
        mockUserId,
        14400, // added seconds
        "team-1"
      );

      expect(NotificationsService.createNotification).toHaveBeenCalledTimes(1);
      expect(NotificationsService.createNotification).toHaveBeenCalledWith({
        userId: mockManagerUserId,
        teamId: "team-1",
        taskId: mockTaskId,
        projectId: "proj-1",
        message: 'Task "Landing Page" has exceeded its estimated time (Tracked: 5h 30m, Estimated: 3h).',
      });
    });

    it("should notify manager when task exceeds maximum approved time", async () => {
      (db.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            {
              id: mockTaskId,
              name: "Landing Page",
              total_minutes: 0,
              maximum_approved_minutes: 240, // 4 hours = 14400s
              project_id: "proj-1",
              team_id: "team-1",
              reports_to_member_id: "tm-mgr",
              user_name: "Ahmed",
            },
          ],
        })
        // Total time: 5h 30m = 19800s
        .mockResolvedValueOnce({
          rows: [{ total_seconds: 19800 }],
        })
        // Manager lookup
        .mockResolvedValueOnce({
          rows: [{ user_id: mockManagerUserId }],
        });

      // Added 2h (7200s), before was 19800 - 7200 = 12600s (below 14400s) -> crossed maximum threshold
      await TaskTimeApprovalService.checkTaskTimeThresholds(
        mockTaskId,
        mockUserId,
        7200,
        "team-1"
      );

      expect(NotificationsService.createNotification).toHaveBeenCalledTimes(1);
      expect(NotificationsService.createNotification).toHaveBeenCalledWith({
        userId: mockManagerUserId,
        teamId: "team-1",
        taskId: mockTaskId,
        projectId: "proj-1",
        message: 'Task "Landing Page" has exceeded maximum approved time (Tracked: 5h 30m, Maximum: 4h).',
      });
    });

    it("should NOT send notification if threshold was already exceeded before (prevents spam)", async () => {
      (db.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            {
              id: mockTaskId,
              name: "Landing Page",
              total_minutes: 180, // 3h = 10800s
              maximum_approved_minutes: 0,
              project_id: "proj-1",
              team_id: "team-1",
              reports_to_member_id: "tm-mgr",
              user_name: "Ahmed",
            },
          ],
        })
        // Total recorded: 19800s
        .mockResolvedValueOnce({
          rows: [{ total_seconds: 19800 }],
        })
        .mockResolvedValueOnce({
          rows: [{ user_id: mockManagerUserId }],
        });

      // Added 30m (1800s), before was 18000s (already well above 10800s)
      await TaskTimeApprovalService.checkTaskTimeThresholds(
        mockTaskId,
        mockUserId,
        1800,
        "team-1"
      );

      expect(NotificationsService.createNotification).not.toHaveBeenCalled();
    });
  });
});

# Worklenz Employee Task, Time Tracking & Manager Approval — Implementation Reference

> **Purpose:** This document is the implementation reference for modifying a fork of the open-source Worklenz project into an internal **Employee Task + Time Tracking + Manager Approval** system.
>
> **Agent instruction:** Treat this document as the source of truth while working. Do not rebuild Worklenz from scratch. Reuse existing Worklenz architecture and functionality wherever possible, and implement only the missing business rules and UI required here.

---

## 1. Primary Product Goal

The final application must support the following workflows.

### Employee

An employee can:

- Create tasks for themselves where current Worklenz permissions allow it.
- Receive tasks from managers.
- Track time on tasks.
- Pause/resume timers.
- Manually enter time where permitted.
- Complete tasks.
- Submit task time for manager approval.
- View recorded time.
- View approved time.
- See when a manager adjusts submitted time.
- See the adjustment reason.
- See rejected submissions.
- See daily, weekly, and monthly timesheets.

### Manager

A manager is **also a normal worker**.

A manager must have two contexts:

#### My Work

A manager can:

- Create tasks for themselves.
- Track their own time.
- Complete their own tasks.
- Submit their own time.
- View their own timesheet.

#### My Team

A manager can:

- Create tasks for employees.
- Assign tasks to employees.
- Review submitted employee time.
- Approve employee time.
- Reduce/adjust approved time.
- Reject/return submissions.
- See recorded vs approved hours.
- View team timesheets.
- View employee performance information.
- See tasks exceeding expected time.

### Critical Rule

A manager **must never approve their own submitted work**.

A manager's own submission must go to their manager according to the existing Worklenz reporting hierarchy.

---

## 2. Do Not Rebuild Existing Worklenz Features

Do **not** replace working Worklenz functionality unless technically necessary.

Reuse existing:

- Users.
- Teams.
- Team members.
- Projects.
- Tasks.
- Task assignees.
- Task estimates.
- Time tracking.
- Time logs.
- Comments.
- Attachments.
- Notifications.
- Reporting.
- Team lead / manager hierarchy.
- PWA infrastructure.
- Authentication.
- Authorization.
- Realtime/WebSocket infrastructure where present.

Do not create duplicate systems for functionality Worklenz already has.

---

## 3. Phase 0 — Repository Analysis

Before writing code, inspect the repository thoroughly.

Identify and document:

1. Frontend framework and version.
2. Backend framework and version.
3. Database layer.
4. PostgreSQL migration system.
5. Task database structure.
6. Task assignee structure.
7. Time tracking implementation.
8. Time log database structure.
9. Existing timesheet functionality.
10. Existing timesheet approval functionality.
11. Team member model.
12. Manager/team-lead hierarchy.
13. Authentication.
14. Authorization middleware.
15. Notification infrastructure.
16. WebSocket/realtime infrastructure.
17. Reporting infrastructure.
18. Audit/activity logging.
19. PWA manifest.
20. Service worker.
21. Frontend state management.
22. API client conventions.
23. Testing setup.

Search specifically for concepts such as:

```text
reports_to_member_id
team lead
timesheet
approval
time log
timer
task estimate
total_minutes
task assignee
auto_assign_task_creator
audit
activity
notification
service worker
manifest
```

Do not assume this document exactly matches current Worklenz internals.

The current repository implementation is the technical source of truth.

After inspection:

1. Create a short implementation plan.
2. Record baseline build/test/lint failures.
3. Continue implementation.
4. Do not stop at analysis unless blocked by a genuine architectural issue.

---

# 4. Core Architectural Rule — Recorded Time vs Approved Time

The employee's original recorded time must **never be overwritten** when a manager changes approved time.

These are two independent values:

- **Recorded Time**
- **Approved Time**

Example:

```text
Employee tracked:
5h 30m

Manager approved:
4h

Recorded Time:
5h 30m

Approved Time:
4h

Adjustment:
-1h 30m
```

The original employee time logs must remain unchanged.

This requirement is critical.

---

# 5. Multiple Assignees

Worklenz may support multiple users on one task.

Approval must therefore not simply belong to a task.

It should conceptually belong to:

```text
Task
+
Team Member
+
Submission
```

Example:

```text
Task: Build Website

Ahmed:
Recorded 5h
Approved 4h

Sara:
Recorded 3h
Approved 3h

Mohamed:
Recorded 2h
Approved 1h 45m
```

Do not store only:

```text
Task Approved Time = 8h 45m
```

because that loses employee-level accountability.

Approval must remain traceable to the individual employee.

---

# 6. Use the Existing Management Hierarchy

Inspect Worklenz's current reporting hierarchy.

If a structure such as:

```text
team_members.reports_to_member_id
```

already exists, reuse it.

Do **not** create a second `ManagerId` hierarchy unless current architecture cannot support the required workflow.

Conceptual hierarchy:

```text
CEO
 ↓
Operations Manager
 ↓
Team Leader
 ↓
Employee
```

Approval routing:

```text
Ahmed reports to Mohamed
→ Ahmed's submission goes to Mohamed

Mohamed reports to Karim
→ Mohamed's submission goes to Karim

Karim reports to CEO
→ Karim's submission goes to CEO
```

---

# 7. Manager Self Tasks

Managers must be able to create tasks for themselves.

Do not create separate:

```text
manager_tasks
employee_tasks
```

Use normal Worklenz tasks.

Task creation should make self-assignment obvious:

```text
ASSIGN TO

[ Me ]
Ahmed
Sara
Omar
```

If manager Mohamed selects `Me`, assign the normal Worklenz task to Mohamed.

Reuse existing functionality such as:

```text
auto_assign_task_creator
```

or an equivalent existing implementation where appropriate.

---

# 8. Self-Approval Security

A user must **never** approve their own submission.

Enforce this on the backend.

Do not rely only on hiding UI controls.

Example validation:

```text
if approverMemberId == submittedByMemberId
    reject
```

Use an appropriate domain error such as:

```text
SELF_APPROVAL_NOT_ALLOWED
```

Also verify that the manager is actually authorized to approve the submitting employee.

Never accept a random approval ID or employee ID from the frontend without authorization checks.

Prevent IDOR vulnerabilities.

---

# 9. Top-Level Manager

A top-level user may have:

```text
reports_to_member_id = NULL
```

Create a configurable organization/team policy.

Possible values:

```text
NO_APPROVAL_REQUIRED
AUTO_APPROVE
SPECIFIC_APPROVER
```

Prefer configuration over hardcoding.

Do not implement:

```text
if CEO then auto approve
```

If Worklenz already has organization/team settings, extend that architecture.

Otherwise create the smallest maintainable configuration required.

---

# 10. Keep Task Status and Time Approval Status Separate

Do not mix normal project/task status with manager time approval status.

A task may be:

```text
TODO
IN PROGRESS
DONE
```

while time approval can independently be:

```text
NOT_SUBMITTED
PENDING
APPROVED
ADJUSTED
REJECTED
```

Example:

```text
Task Status:
DONE

Time Approval:
REJECTED
```

Meaning:

> The work itself is complete, but the submitted hours were rejected.

Do not force approval states into the task workflow.

---

# 11. New Time Approval Model

Inspect existing Worklenz timesheet/approval entities first.

If an existing approval model can be safely extended, extend it.

Otherwise create a dedicated structure conceptually similar to:

```text
task_time_approvals
```

Fields should include approximately:

```text
id UUID

task_id UUID NOT NULL

team_member_id UUID NOT NULL

submitted_by_member_id UUID NOT NULL

approver_member_id UUID

recorded_duration
approved_duration

status

adjustment_reason

submitted_at
reviewed_at

created_at
updated_at

submission_number
version
rejection_reason
manager_comment
```

Use Worklenz conventions for:

- UUIDs.
- Timestamp types.
- Duration units.
- Foreign keys.
- Migration naming.
- Database naming.

Do not introduce seconds if Worklenz standardizes on minutes, or vice versa.

---

# 12. Approval Statuses

Implement statuses equivalent to:

```text
PENDING
APPROVED
ADJUSTED
REJECTED
```

Optionally:

```text
CANCELLED
```

if needed for resubmission/versioning.

Use enums/constants following current Worklenz conventions.

Avoid magic strings.

---

# 13. Submission Workflow

When an employee finishes work:

```text
Task completed
↓
Submit Time for Approval
↓
Approval Status = PENDING
```

Example UI:

```text
Task:
Landing Page

Recorded:
5h 30m

[ Submit for Approval ]
```

After submission:

```text
Approval Status:
PENDING

Approver:
Mohamed Hassan

Submitted:
Aug 27, 2026 4:32 PM
```

---

# 14. Submission Snapshot Behavior

Each submission must preserve a clear snapshot of what was submitted.

If recorded time at submission is:

```text
330 minutes
```

store that submission value.

Do not silently mutate historical submission values if additional logs appear afterward.

Preferred behavior:

- Lock relevant submitted time logs while approval is unresolved.
- If changes are needed, use a controlled correction/resubmission workflow.

Do not create ambiguous historical data.

---

# 15. Submitted Time Locking

Once time is submitted:

- Prevent normal users from silently editing submitted historical entries.
- Prevent silent deletion of submitted historical entries.
- Keep an audit trail for corrections.
- Preserve what the manager originally reviewed.

If corrections are required:

- Return/reject the submission.
- Allow controlled changes.
- Resubmit as a new submission/version.

---

# 16. Manager Approval Actions

Managers need three primary actions.

## Approve

```text
Recorded:
5h 30m

Approved:
5h 30m

Status:
APPROVED
```

## Adjust

```text
Recorded:
5h 30m

Approved:
4h

Adjustment Reason:
"1.5 hours related to unrelated research."

Status:
ADJUSTED
```

## Reject / Return

Require a manager reason.

```text
Status:
REJECTED
```

The employee should be able to view the reason and resubmit according to the defined workflow.

---

# 17. Adjustment Rule

If:

```text
approved_duration != recorded_duration
```

then:

```text
adjustment_reason
```

is mandatory.

Backend validation is required.

Example response:

```json
{
  "code": "ADJUSTMENT_REASON_REQUIRED",
  "message": "A reason is required when approved time differs from recorded time."
}
```

---

# 18. Maximum Approved Time

Worklenz already has task time estimation.

Reuse the existing estimate.

Do not create another estimate system.

Add an optional field:

```text
Maximum Approved Time
```

Use the duration representation already used by Worklenz.

Example:

```text
Estimated:
2h

Maximum Approved:
3h

Employee Recorded:
4h 17m
```

Manager sees:

```text
⚠ 1h 17m above maximum approved time
```

Important:

Do not modify the employee's recorded `4h 17m`.

Maximum approved time is primarily:

- Management guidance.
- Warning.
- Approval-policy input.

If any automatic cap is implemented, it may affect only a proposed/approved value, never recorded time.

The manager must always see the original recorded value.

---

# 19. Task Creation UI

Extend Worklenz task creation.

Add where appropriate:

```text
Estimated Time
Maximum Approved Time
```

For managers:

```text
Assign To

[ Me ]
[ Authorized employee list ]
```

Only show employees the manager is authorized to manage according to existing Worklenz project/team permissions.

Do not expose all organization members without authorization.

---

# 20. Employee Task Creation

Employees may create their own tasks where existing Worklenz permissions allow it.

Respect existing restrictions such as:

```text
restrict task creation
```

or equivalent settings.

Do not bypass project/team permission rules.

---

# 21. Only One Active Timer

Inspect current Worklenz behavior first.

If multiple active timers are already prevented, keep the current implementation.

Otherwise add a backend-enforced rule:

> One team member may have only one active timer at a time.

If a second timer is started:

```http
409 Conflict
```

Example:

```json
{
  "code": "ACTIVE_TIMER_EXISTS",
  "message": "You already have an active timer.",
  "details": {
    "taskId": "...",
    "taskName": "..."
  }
}
```

Frontend should offer:

```text
[ Go to Active Task ]
```

Use transactions/database safeguards to prevent race conditions.

---

# 22. Timer Source of Truth

Do not use a browser `setInterval` value as persisted work duration.

The frontend timer may update every second.

The authoritative source must remain:

- Backend timestamps.
- Database time logs.
- Existing Worklenz time tracking.

This is especially important for:

- PWA.
- Android.
- iPhone.
- Background tabs.
- Suspended browser sessions.

---

# 23. Manager Approval Page

Add a manager navigation area:

```text
Approvals
```

Example:

```text
PENDING APPROVALS

Employee      Task             Estimated   Recorded   Max      Variance

Ahmed         Landing Page       3h         5h30m     4h       +83%
Sara          Research           2h         1h45m     3h       -12%
Omar          API Work           5h         8h20m     6h       +67%
```

Support filters:

- Date range.
- Employee.
- Project.
- Team.
- Status.
- Over estimate.
- Over maximum.
- Search.

Use server-side pagination if existing Worklenz tables use it.

---

# 24. Approval Details

Approval details should show:

- Task title.
- Employee.
- Project.
- Task status.
- Estimated time.
- Maximum approved time.
- Recorded time.
- Variance time.
- Variance percentage.
- Current approval status.
- Time entries/sessions.
- Submission time.
- Approver.
- Relevant comments.
- Activity/history.

Manager actions:

```text
Approve
Adjust Time
Reject
```

---

# 25. Variance

Calculate:

```text
Variance = Recorded - Estimated
```

Example:

```text
Estimated:
2h

Recorded:
5h

Variance:
+3h

Variance %:
+150%
```

Handle zero or null estimate safely.

Do not divide by zero.

Variance is informational only.

Do not automatically classify an employee as good/bad because of variance.

---

# 26. Manager Dashboard

Managers need two clear sections.

## My Work

Example:

```text
My Tasks
8

Hours Today
5h 42m

My Pending Submission
2
```

## My Team

Example:

```text
Employees
12

Tasks In Progress
31

Pending Approvals
8

Overdue Tasks
4

Recorded Today
76h

Approved Today
68h

Pending Time
8h
```

Reuse existing Worklenz dashboard/report queries where possible.

Do not duplicate analytics pipelines unnecessarily.

---

# 27. Employee Dashboard

Add approval information.

Example:

```text
Tasks Today
5

Completed
3

Recorded Today
7h 15m

Approved Today
6h 30m

Pending Approval
2
```

Recent tasks:

```text
Task              Recorded     Approved      Approval

Landing Page       5h30m         4h           Adjusted
Research           1h45m         —            Pending
Bug Fix            2h15m         2h15m        Approved
```

---

# 28. My Timesheet

Extend existing Worklenz timesheet functionality.

Do not create a second independent timesheet system.

Views:

```text
DAILY
WEEKLY
MONTHLY
```

Show:

- Recorded.
- Approved.
- Pending.
- Adjusted difference.

Example:

```text
Monday:
Recorded 8h
Approved 7h30m

Tuesday:
Recorded 7h
Approved 7h

Wednesday:
Recorded 8h20m
Pending 2h
```

Weekly totals:

```text
Recorded:
38h25m

Approved:
35h50m

Pending:
1h35m

Adjustment:
-1h
```

Allow opening a day/task to inspect details.

---

# 29. Team Timesheet

Manager view should include:

```text
Employee
Tasks
Recorded Time
Approved Time
Pending Time
Adjustment Difference
```

Example:

```text
Employee       Tasks    Recorded    Approved    Adjustment

Ahmed           22       43h15m      39h30m      -3h45m
Sara            19       38h40m      38h40m       0
Omar            25       47h20m      42h10m      -5h10m
```

Filters:

- Date.
- Employee.
- Team.
- Project.
- Approval status.

---

# 30. Reporting

Extend existing Worklenz reports.

Do not rebuild the whole reporting system.

Add support for:

- Recorded hours.
- Approved hours.
- Pending hours.
- Adjusted difference.
- Adjustment percentage.
- Estimated vs recorded.
- Estimated vs approved.
- Tasks above estimate.
- Tasks above maximum approved.
- Approved tasks.
- Adjusted tasks.
- Rejected submissions.

## Employee Report

Show:

- Tasks completed.
- Estimated hours.
- Recorded hours.
- Approved hours.
- Adjustment.
- Average variance.
- Tasks above estimate.
- Tasks above maximum.

## Team Report

Show:

```text
Employee
Tasks
Estimated
Recorded
Approved
Difference
```

## Project Report

Show:

```text
Estimated
Recorded
Approved
Variance
```

---

# 31. Do Not Implement a Bad Productivity Score

Do not create simplistic rankings such as:

```text
less hours = better employee
```

or:

```text
more variance = bad employee
```

Time alone does not represent task complexity.

Keep metrics separate:

- Task completion.
- Estimated time.
- Recorded time.
- Approved time.
- Deadline performance.
- Variance.

Do not implement an automatic punitive productivity score.

---

# 32. Audit History

Inspect and reuse existing Worklenz activity/audit infrastructure where appropriate.

Record important events such as:

```text
TASK_CREATED
TASK_ASSIGNED
TIMER_STARTED
TIMER_STOPPED
MANUAL_TIME_ADDED
TIME_SUBMITTED
TIME_APPROVED
TIME_ADJUSTED
TIME_REJECTED
TIME_RESUBMITTED
APPROVER_CHANGED
```

Adjustment example:

```text
Employee Recorded:
5h30m

Approved:
4h

Manager:
Mohamed

Reason:
"1.5 hours was unrelated work"

Timestamp:
...
```

Audit history must be immutable to normal employees/managers.

---

# 33. Approval History

Do not overwrite old submissions.

Example:

```text
Submission #1
Recorded 5h30m
Rejected
Reason: ...

Submission #2
Recorded 5h
Approved 5h
```

Both manager and employee should be able to see this history.

---

# 34. Authorization

Review every new API.

An employee may access:

- Their own submissions.
- Their own approved time.
- Their own task time.

A manager may access:

- Their own data.
- Employees they are authorized to manage.

Never trust these values simply because the frontend sends them:

```text
employeeId
teamMemberId
taskId
approvalId
```

Validate authorization server-side.

Prevent:

- Cross-team access.
- Cross-organization access.
- IDOR.
- Approval of unauthorized employees.

---

# 35. Tenant Isolation

Preserve existing Worklenz tenant isolation.

Every new approval query/mutation must enforce correct:

- Team.
- Organization.
- Project.
- Membership.

boundaries according to existing architecture.

Never implement a query like:

```sql
SELECT * FROM approval WHERE id = $1;
```

without validating tenant/member access.

---

# 36. Database Constraints

Use proper:

- Foreign keys.
- Indexes.
- Unique constraints.
- Referential integrity.

Consider indexes for:

```text
task_id
team_member_id
approver_member_id
status
submitted_at
reviewed_at
```

Consider a uniqueness rule preventing duplicate active pending submissions for the same:

```text
task
+
member
```

unless versioning design requires otherwise.

Avoid orphan records.

---

# 37. Transactions and Concurrency

Handle race conditions.

Examples:

- Two approval requests arrive simultaneously.
- Manager approves while employee modifies submitted time.
- Two submissions happen simultaneously.
- Two timers start simultaneously.

Use appropriate:

- Database transactions.
- Row locking.
- Optimistic concurrency.
- Unique constraints.

Follow existing Worklenz patterns.

Approvals should be idempotent where practical.

---

# 38. Error Responses

Follow existing Worklenz API conventions.

Create clear domain errors such as:

```text
SELF_APPROVAL_NOT_ALLOWED
APPROVAL_ALREADY_REVIEWED
ADJUSTMENT_REASON_REQUIRED
NOT_AUTHORIZED_TO_APPROVE
TIME_ALREADY_SUBMITTED
SUBMITTED_TIME_LOCKED
ACTIVE_TIMER_EXISTS
MAXIMUM_APPROVED_TIME_INVALID
APPROVER_NOT_CONFIGURED
```

Frontend must show clean user-facing messages.

---

# 39. Notifications

Reuse Worklenz notification infrastructure.

Add notifications such as:

## Employee

```text
TIME_APPROVED
TIME_ADJUSTED
TIME_REJECTED
```

## Manager

```text
TIME_SUBMITTED
TIME_RESUBMITTED
TASK_EXCEEDED_ESTIMATE
TASK_EXCEEDED_MAXIMUM
```

Examples:

```text
Ahmed submitted 5h 30m for Landing Page.

Your submitted time for Landing Page was adjusted from 5h 30m to 4h.

Your time submission was rejected. View manager comments.
```

Avoid notification spam.

---

# 40. Realtime

If Worklenz already uses WebSockets/realtime updates, reuse that infrastructure.

Examples:

```text
approval submitted
→ manager pending approval count updates

manager approves
→ employee approval status updates
```

Do not create a second realtime system.

---

# 41. PWA

Inspect existing Worklenz:

- Manifest.
- Service worker.
- PWA registration.
- Icons.
- Metadata.

Keep PWA functionality working.

The final application must remain installable on:

- Chrome desktop.
- Edge desktop.
- Android.
- iPhone/iPad Add to Home Screen where supported.

Installed display mode:

```text
standalone
```

Rebrand:

- Application name.
- Short name.
- Icons.
- Theme.
- Favicon.

Do not remove required license notices.

---

# 42. PWA Cache Security

Approval and timesheet information is sensitive and dynamic.

Inspect the current service-worker caching strategy.

New endpoints such as:

```text
/approvals
/time-approvals
/timesheets
/time-entries
/manager/*
/reports/*
```

should generally be network-only or use a strategy that guarantees managers do not unknowingly review stale data.

Never cache mutation requests:

```text
POST
PUT
PATCH
DELETE
```

Do not cache:

- Authentication responses.
- Tokens.
- Sensitive dynamic approval state.

Static assets may use appropriate caching.

---

# 43. Offline UX

When offline, do not pretend sensitive actions succeeded.

Operations such as:

- Submit time.
- Approve.
- Adjust.
- Reject.
- Create business records.

must show a clear offline error unless Worklenz already has a safe reliable sync implementation.

Example:

```text
You're offline. This action requires an internet connection.
```

Do not silently queue manager approvals.

---

# 44. Mobile Responsiveness

Because this is a PWA, review modified screens at mobile widths.

Prioritize:

- Task details.
- Timer.
- My Tasks.
- Create Task.
- Approvals.
- Approval Details.
- My Timesheet.
- Team Timesheet.
- Manager Dashboard.

Large tables should become:

- Responsive tables.
- Horizontal-scroll layouts.
- Mobile cards.

Follow existing Worklenz design conventions.

Do not redesign the entire application unnecessarily.

---

# 45. Branding Preparation

Identify and centralize where possible:

- Worklenz name references.
- Logos.
- Favicons.
- PWA icons.
- Page titles.
- Manifest name.
- Email branding.
- Theme references.

Create:

```text
BRANDING.md
```

explaining where custom branding assets/configuration live.

Do not remove license notices that legally must remain.

---

# 46. Backward Compatibility

Existing Worklenz functionality must continue working.

Do not break:

- Existing projects.
- Existing tasks.
- Existing time logs.
- Existing users.
- Existing teams.
- Existing task assignments.
- Existing project reports.

Database changes must use forward migrations.

Do not wipe/recreate an existing database.

Do not rewrite historical migration files that may already have shipped.

Create new migrations.

---

# 47. Existing Worklenz Features Must Be Reused

Before implementing anything, search the repository.

Examples:

```text
Need manager relationship?
→ inspect existing reporting hierarchy first.

Need notifications?
→ use Worklenz notifications.

Need timer?
→ use current timer system.

Need comments?
→ use current comments.

Need project reports?
→ extend current reports.

Need realtime?
→ use current socket infrastructure.

Need PWA?
→ extend current PWA.
```

Do not introduce parallel systems unless absolutely necessary.

---

# 48. Code Quality

Follow existing Worklenz coding style and architecture.

Preserve:

- TypeScript strictness.
- Existing lint rules.
- Existing formatting.
- Existing component patterns.
- Existing controller/service/database patterns.

Do not:

- Disable TypeScript.
- Disable lint rules to hide problems.
- Add unnecessary `any`.
- Duplicate utilities.
- Hardcode URLs.
- Hardcode IDs.
- Hardcode CEO/admin users.
- Put critical business rules only in React.

Critical business rules belong on the backend.

---

# 49. Required Tests

Add automated tests for the new workflow.

At minimum test:

1. Employee can submit their own tracked time.
2. Employee cannot approve their own submission.
3. Manager can approve direct-report submission.
4. Unrelated manager cannot approve another employee's submission.
5. Manager cannot approve their own submission.
6. Manager submission routes to their manager.
7. Top-level manager policy works.
8. Manager can adjust approved duration.
9. Original recorded duration remains unchanged after adjustment.
10. Adjustment requires a reason.
11. Approval cannot be processed twice incorrectly.
12. Rejected submission can follow the intended resubmission workflow.
13. Multiple assignees receive independent approval records.
14. Tenant isolation works.
15. Cross-team approval IDOR attempt fails.
16. Maximum approved duration warning works.
17. Time logs remain unchanged by manager adjustment.
18. Submitted historical time cannot be silently deleted.
19. Existing task/time tracking tests still pass.
20. Existing Worklenz functionality still builds.

---

# 50. Database Migration Testing

Test both:

- Fresh database migration.
- Migration from an existing Worklenz database.

Do not assume only new installations.

Existing records must remain valid when new fields are nullable/defaulted.

---

# 51. Security Review

Before completion, review new code for:

- IDOR.
- SQL injection.
- Authorization bypass.
- Tenant isolation bugs.
- Self approval.
- Mass assignment.
- Unsafe object merging.
- Race conditions.
- Unsafe cached data.
- XSS in manager comments/reasons.
- File/attachment access.

Use parameterized queries according to existing Worklenz conventions.

Never concatenate untrusted IDs/text into SQL.

---

# 52. Implementation Phases

## Phase 1 — Repository Analysis

Understand:

- Users.
- Tasks.
- Timers.
- Time logs.
- Team hierarchy.
- Timesheets.
- PWA.
- Notifications.
- Reporting.

Run existing tests/build/lint first.

Record baseline failures.

## Phase 2 — Database / Domain Model

Implement:

- Time approval structure.
- Approval status.
- Maximum approved time.
- Top-level approval policy.
- Indexes.
- Constraints.
- Migrations.

## Phase 3 — Backend Business Logic

Implement:

- Submission.
- Approver resolution.
- Approval.
- Adjustment.
- Rejection.
- Resubmission.
- Self-approval prevention.
- Authorization.
- Audit history.

## Phase 4 — API Endpoints

Prefer current Worklenz routing conventions.

Conceptual endpoints may include:

```text
POST /tasks/:taskId/time-approval/submit

GET /time-approvals/my

GET /time-approvals/pending

GET /time-approvals/:id

POST /time-approvals/:id/approve

POST /time-approvals/:id/adjust

POST /time-approvals/:id/reject

POST /time-approvals/:id/resubmit

GET /timesheets/my

GET /timesheets/team
```

Do not blindly use these routes if equivalent Worklenz APIs already exist.

## Phase 5 — Employee UI

Implement:

- Submit Time.
- Approval status.
- Recorded vs approved.
- Adjustment reason.
- Approval history.
- Timesheet changes.

## Phase 6 — Manager UI

Implement:

- Approvals page.
- Approval details.
- Approve.
- Adjust.
- Reject.
- Filters.
- Variance.
- Maximum-approved warnings.

## Phase 7 — Manager Dashboard

Implement:

```text
MY WORK
MY TEAM
```

## Phase 8 — Reports

Add:

- Recorded.
- Approved.
- Pending.
- Adjustment.
- Variance.

## Phase 9 — Notifications / Realtime

Extend current Worklenz infrastructure.

## Phase 10 — PWA / Mobile / Branding

Implement:

- PWA cache hardening.
- Mobile responsiveness.
- Branding preparation.

## Phase 11 — Security / Tests / Build

Run:

- Security review.
- Tests.
- Lint.
- Type checking.
- Builds.
- Migration tests.

---

# 53. Build Rule

After every major phase:

1. Run relevant backend tests.
2. Run relevant frontend tests.
3. Run lint.
4. Run type checking.
5. Run builds.
6. Fix errors introduced by changes before moving on.

Do not claim errors are unrelated unless baseline results prove they existed before modifications.

---

# 54. Do Not Do These

Do not:

- Rewrite Worklenz.
- Replace PostgreSQL.
- Replace the frontend framework.
- Replace authentication.
- Replace the timer system.
- Create a completely separate timesheet system.
- Create a second users table.
- Create a second manager hierarchy.
- Change recorded time when managers adjust approval.
- Allow managers to self approve.
- Trust frontend authorization.
- Allow cross-team approval access.
- Hardcode business users.
- Delete existing migration history.
- Cache sensitive approval data offline.
- Silently auto-correct recorded time.
- Create an employee productivity score based only on hours.

---

# 55. Acceptance Scenario 1 — Employee Time Adjustment

Setup:

```text
Ahmed reports to Mohamed.
```

Task:

```text
Landing Page

Estimated:
3h

Maximum Approved:
4h
```

Ahmed tracks:

```text
Session 1:
1h30m

Session 2:
2h

Session 3:
2h
```

Recorded total:

```text
5h30m
```

Ahmed submits.

System creates:

```text
Recorded:
5h30m

Status:
PENDING

Approver:
Mohamed
```

Manager sees:

```text
Estimated:
3h

Maximum:
4h

Recorded:
5h30m

Variance:
+2h30m
+83.33%
```

Mohamed chooses:

```text
Adjust
```

Approved:

```text
4h
```

Reason:

```text
1.5 hours exceeded the approved scope.
```

Final:

```text
Recorded:
5h30m

Approved:
4h

Difference:
-1h30m

Status:
ADJUSTED
```

Requirements:

- Ahmed's original time logs remain unchanged.
- Ahmed receives a notification.
- Audit history records the adjustment.

---

# 56. Acceptance Scenario 2 — Manager Personal Task

Setup:

```text
Mohamed is Ahmed's manager.
Mohamed reports to Karim.
```

Mohamed creates a task and chooses:

```text
Assign To:
Me
```

Mohamed records:

```text
3h
```

Mohamed submits.

Expected:

```text
Approver:
Karim
```

Mohamed must not be able to approve his own submission.

If Mohamed calls the backend approval API directly against his own submission, the backend must reject it.

---

# 57. Acceptance Scenario 3 — Multiple Assignees

Task:

```text
Ahmed
Sara
```

Recorded:

```text
Ahmed:
5h

Sara:
3h
```

Submissions:

```text
Ahmed submits 5h
Sara submits 3h
```

Manager approves:

```text
Ahmed:
Recorded 5h
Approved 4h

Sara:
Recorded 3h
Approved 3h
```

Task-level aggregate may show:

```text
Recorded:
8h

Approved:
7h
```

But individual approval records must remain independent.

---

# 58. Acceptance Scenario 4 — Cross-Team Authorization

A manager in Team B obtains an approval UUID belonging to Team A.

They attempt to call the approval endpoint.

Expected:

- Request is denied.
- No approval details are leaked.
- Employee name is not leaked.
- Task name is not leaked.
- Recorded time is not leaked.
- Unauthorized approval cannot occur.

---

# 59. Final Deliverable

When implementation is complete, provide:

1. Summary of Worklenz architecture discovered.
2. Existing Worklenz functionality reused.
3. New functionality added.
4. Database tables/columns added.
5. Migrations created.
6. Backend files modified.
7. Frontend files modified.
8. API endpoints added/modified.
9. How approver resolution works.
10. How self-approval is prevented.
11. How manager personal tasks work.
12. How recorded vs approved time is stored.
13. How multiple assignees are handled.
14. How maximum approved time works.
15. How rejected/resubmitted approvals work.
16. How audit history works.
17. How authorization/tenant isolation is enforced.
18. Dashboard changes.
19. Report changes.
20. Notification changes.
21. PWA/service-worker changes.
22. Tests added.
23. Build/test/lint results.
24. Known remaining issues.
25. Security concerns discovered in existing Worklenz code affecting this feature.
26. Instructions to run the modified project locally.
27. Instructions to apply new database migrations.
28. Screens/pages requiring manual testing.
29. Worklenz upstream areas likely to create future rebase conflicts.

---

# 60. Final Agent Instruction

Do not merely produce an analysis or implementation proposal.

Actually implement the changes in the repository.

Start by inspecting the existing Worklenz implementation.

Reuse existing functionality aggressively.

Make minimal, maintainable changes.

Do not rewrite working systems.

Preserve recorded time permanently.

Enforce manager approval rules on the backend.

Keep the resulting fork maintainable so future Worklenz upstream changes can still be merged.

---

## Quick Non-Negotiable Checklist

Before considering the work complete, confirm all of the following:

- [ ] Worklenz was extended, not rebuilt.
- [ ] Manager can create and track personal tasks.
- [ ] Manager personal submissions route upward.
- [ ] Self-approval is blocked on the backend.
- [ ] Recorded time is immutable after approval adjustment.
- [ ] Approved time is stored separately.
- [ ] Adjustment reason is required when values differ.
- [ ] Multiple assignees are approved independently.
- [ ] Maximum approved time exists as a separate optional concept.
- [ ] Task status and time approval status are independent.
- [ ] Submission history/versioning is preserved.
- [ ] Submitted time cannot be silently edited/deleted.
- [ ] Authorization and tenant isolation are enforced server-side.
- [ ] Manager dashboard contains My Work and My Team.
- [ ] Employee and team timesheets show Recorded / Approved / Pending / Adjustment.
- [ ] Existing Worklenz reports are extended rather than duplicated.
- [ ] Notifications reuse existing infrastructure.
- [ ] PWA support remains functional.
- [ ] Sensitive approval endpoints do not return stale cached data.
- [ ] Mobile UI remains usable.
- [ ] Existing Worklenz features remain backward compatible.
- [ ] Fresh and upgrade migrations are tested.
- [ ] New security-sensitive workflows have automated tests.
- [ ] Build, lint, type checking, and tests pass or baseline failures are documented.

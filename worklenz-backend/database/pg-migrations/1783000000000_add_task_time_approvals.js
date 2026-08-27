'use strict';

/** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  pgm.sql(`
    -- 1. Add maximum_approved_minutes to tasks table
    ALTER TABLE tasks 
      ADD COLUMN IF NOT EXISTS maximum_approved_minutes NUMERIC DEFAULT NULL;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tasks_maximum_approved_minutes_check'
      ) THEN
        ALTER TABLE tasks
          ADD CONSTRAINT tasks_maximum_approved_minutes_check
          CHECK (maximum_approved_minutes IS NULL OR (maximum_approved_minutes >= 0 AND maximum_approved_minutes <= 999999));
      END IF;
    END $$;

    -- 2. Add time_approval_policy to teams table
    ALTER TABLE teams
      ADD COLUMN IF NOT EXISTS time_approval_policy TEXT DEFAULT 'NO_APPROVAL_REQUIRED';

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'teams_time_approval_policy_check'
      ) THEN
        ALTER TABLE teams
          ADD CONSTRAINT teams_time_approval_policy_check
          CHECK (time_approval_policy IN ('NO_APPROVAL_REQUIRED', 'AUTO_APPROVE', 'SPECIFIC_APPROVER'));
      END IF;
    END $$;

    -- 3. Create task_time_approvals table
    CREATE TABLE IF NOT EXISTS task_time_approvals (
      id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
      submitted_by_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
      approver_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
      recorded_duration NUMERIC DEFAULT 0 NOT NULL,
      approved_duration NUMERIC DEFAULT 0 NOT NULL,
      status TEXT DEFAULT 'PENDING' NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'ADJUSTED', 'REJECTED', 'CANCELLED')),
      adjustment_reason TEXT,
      rejection_reason TEXT,
      manager_comment TEXT,
      submission_number INTEGER DEFAULT 1 NOT NULL,
      version INTEGER DEFAULT 1 NOT NULL,
      submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      reviewed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    -- 4. Create performance and uniqueness indexes
    CREATE INDEX IF NOT EXISTS idx_task_time_approvals_task_member 
      ON task_time_approvals(task_id, team_member_id);

    CREATE INDEX IF NOT EXISTS idx_task_time_approvals_approver 
      ON task_time_approvals(approver_member_id);

    CREATE INDEX IF NOT EXISTS idx_task_time_approvals_status 
      ON task_time_approvals(status);

    CREATE INDEX IF NOT EXISTS idx_task_time_approvals_submitted_at 
      ON task_time_approvals(submitted_at);

    CREATE INDEX IF NOT EXISTS idx_task_time_approvals_team_member 
      ON task_time_approvals(team_member_id);

    CREATE UNIQUE INDEX IF NOT EXISTS uq_task_time_approvals_pending 
      ON task_time_approvals(task_id, team_member_id) 
      WHERE status = 'PENDING';
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS task_time_approvals CASCADE;
    
    ALTER TABLE tasks 
      DROP COLUMN IF EXISTS maximum_approved_minutes;
      
    ALTER TABLE teams 
      DROP COLUMN IF EXISTS time_approval_policy;
  `);
};

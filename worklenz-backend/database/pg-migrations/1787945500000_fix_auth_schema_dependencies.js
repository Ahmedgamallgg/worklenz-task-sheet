'use strict';

/** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  pgm.sql(`
    ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS business_plan_override BOOLEAN DEFAULT FALSE NOT NULL,
      ADD COLUMN IF NOT EXISTS team_member_limit_override INTEGER;

    CREATE TABLE IF NOT EXISTS licensing_plan_tiers (
      id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      tier_name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      trial_duration_days INTEGER,
      trial_enabled BOOLEAN DEFAULT FALSE
    );

    ALTER TABLE licensing_plan_tiers
      ADD COLUMN IF NOT EXISTS trial_duration_days INTEGER,
      ADD COLUMN IF NOT EXISTS trial_enabled BOOLEAN DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS licensing_plan_trials (
      id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      plan_tier_id UUID NOT NULL REFERENCES licensing_plan_tiers(id),
      trial_start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      trial_end_date TIMESTAMP WITH TIME ZONE NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      converted_to_paid BOOLEAN DEFAULT FALSE,
      conversion_date TIMESTAMP WITH TIME ZONE,
      cancellation_reason TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE (user_id, plan_tier_id)
    );

    CREATE INDEX IF NOT EXISTS licensing_plan_trials_user_id_index
      ON licensing_plan_trials(user_id);
    CREATE INDEX IF NOT EXISTS licensing_plan_trials_organization_id_index
      ON licensing_plan_trials(organization_id);
    CREATE INDEX IF NOT EXISTS licensing_plan_trials_active_index
      ON licensing_plan_trials(is_active) WHERE is_active = TRUE;
    CREATE INDEX IF NOT EXISTS licensing_plan_trials_end_date_index
      ON licensing_plan_trials(trial_end_date) WHERE is_active = TRUE;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} _pgm */
exports.down = async (_pgm) => {
  // Keep authentication data and plan-trial records intact on rollback.
};

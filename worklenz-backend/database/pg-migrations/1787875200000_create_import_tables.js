'use strict';

/** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS import_jobs (
      id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      provider TEXT NOT NULL,
      flow_type TEXT NOT NULL CHECK (flow_type IN ('direct', 'csv')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'running', 'success', 'failed')),
      current_step INTEGER NOT NULL DEFAULT 0,
      target_project_id UUID,
      target_space_type TEXT,
      target_template TEXT,
      source_reference JSONB,
      created_by UUID NOT NULL,
      stats JSONB DEFAULT '{}'::JSONB,
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE import_jobs
      ALTER COLUMN id SET DEFAULT uuid_generate_v4();

    CREATE TABLE IF NOT EXISTS import_hierarchy_mappings (
      id BIGSERIAL PRIMARY KEY,
      job_id UUID NOT NULL REFERENCES import_jobs (id) ON DELETE CASCADE,
      source_level TEXT NOT NULL,
      target_level TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS import_field_mappings (
      id BIGSERIAL PRIMARY KEY,
      job_id UUID NOT NULL REFERENCES import_jobs (id) ON DELETE CASCADE,
      source_field TEXT NOT NULL,
      target_field TEXT NOT NULL,
      required BOOLEAN NOT NULL DEFAULT FALSE,
      include BOOLEAN NOT NULL DEFAULT TRUE,
      meta JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS import_value_mappings (
      id BIGSERIAL PRIMARY KEY,
      job_id UUID NOT NULL REFERENCES import_jobs (id) ON DELETE CASCADE,
      source_value TEXT NOT NULL,
      target_worktype TEXT NOT NULL,
      include BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS import_user_mappings (
      id BIGSERIAL PRIMARY KEY,
      job_id UUID NOT NULL REFERENCES import_jobs (id) ON DELETE CASCADE,
      source_user_id TEXT,
      source_email TEXT,
      target_user_id UUID,
      resolution TEXT NOT NULL DEFAULT 'unresolved',
      include BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS import_attachment_plans (
      id BIGSERIAL PRIMARY KEY,
      job_id UUID NOT NULL REFERENCES import_jobs (id) ON DELETE CASCADE,
      source_url TEXT NOT NULL,
      filename TEXT,
      content_type TEXT,
      size_bytes BIGINT,
      status TEXT NOT NULL DEFAULT 'planned',
      storage_key TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS import_stage_tasks (
      id BIGSERIAL PRIMARY KEY,
      job_id UUID NOT NULL REFERENCES import_jobs (id) ON DELETE CASCADE,
      source_task_id TEXT,
      parent_source_task_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT,
      due_at TIMESTAMP WITH TIME ZONE,
      start_at TIMESTAMP WITH TIME ZONE,
      worktype TEXT,
      assignee_source_id TEXT,
      attachments_planned BOOLEAN NOT NULL DEFAULT FALSE,
      raw JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS import_logs (
      id BIGSERIAL PRIMARY KEY,
      job_id UUID NOT NULL REFERENCES import_jobs (id) ON DELETE CASCADE,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      context JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs (status);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_provider ON import_jobs (provider);
    CREATE INDEX IF NOT EXISTS idx_import_hierarchy_job ON import_hierarchy_mappings (job_id);
    CREATE INDEX IF NOT EXISTS idx_import_field_job ON import_field_mappings (job_id);
    CREATE INDEX IF NOT EXISTS idx_import_value_job ON import_value_mappings (job_id);
    CREATE INDEX IF NOT EXISTS idx_import_user_job ON import_user_mappings (job_id);
    CREATE INDEX IF NOT EXISTS idx_import_attachment_job ON import_attachment_plans (job_id);
    CREATE INDEX IF NOT EXISTS idx_import_stage_task_job ON import_stage_tasks (job_id);
    CREATE INDEX IF NOT EXISTS idx_import_logs_job ON import_logs (job_id);
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS import_logs;
    DROP TABLE IF EXISTS import_stage_tasks;
    DROP TABLE IF EXISTS import_attachment_plans;
    DROP TABLE IF EXISTS import_user_mappings;
    DROP TABLE IF EXISTS import_value_mappings;
    DROP TABLE IF EXISTS import_field_mappings;
    DROP TABLE IF EXISTS import_hierarchy_mappings;
    DROP TABLE IF EXISTS import_jobs;
  `);
};

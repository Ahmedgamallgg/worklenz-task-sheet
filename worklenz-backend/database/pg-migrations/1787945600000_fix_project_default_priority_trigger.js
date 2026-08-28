'use strict';

/** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION set_project_default_priority_trigger_fn() RETURNS TRIGGER AS
    $$
    DECLARE
    BEGIN
      IF NEW.priority_id IS NULL THEN
        SELECT id
        FROM sys_project_priorities
        WHERE name = 'Medium'
        LIMIT 1
        INTO NEW.priority_id;
      END IF;

      RETURN NEW;
    END
    $$ LANGUAGE plpgsql;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} _pgm */
exports.down = async (_pgm) => {
  // Keep the data-integrity repair on rollback.
};

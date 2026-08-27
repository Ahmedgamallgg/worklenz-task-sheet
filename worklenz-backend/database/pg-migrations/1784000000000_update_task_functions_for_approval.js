'use strict';

/** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */
exports.shorthands = undefined;

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  pgm.sql(`
    -- 1. Update create_task to accept maximum_approved_minutes
    CREATE OR REPLACE FUNCTION create_task(_body json) RETURNS json
        LANGUAGE plpgsql
    AS
    $$
    DECLARE
        _assignee                 TEXT;
        _attachment_id            TEXT;
        _assignee_id              UUID;
        _task_id                  UUID;
        _label                    JSON;
        _auto_assign_task_creator BOOLEAN;
        _reporter_id              UUID;
        _project_id               UUID;
        _team_id                  UUID;
        _team_member_id           UUID;
        _is_admin                 BOOLEAN;
        _already_assigned         BOOLEAN := FALSE;
    BEGIN
        _reporter_id = (_body ->> 'reporter_id')::UUID;
        _project_id = (_body ->> 'project_id')::UUID;
        _team_id = (_body ->> 'team_id')::UUID;

        INSERT INTO tasks (name, done, priority_id, project_id, reporter_id, start_date, end_date, total_minutes,
                           maximum_approved_minutes, description, parent_task_id, status_id, sort_order)
        VALUES (TRIM((_body ->> 'name')::TEXT), (FALSE),
                COALESCE((_body ->> 'priority_id')::UUID, (SELECT id FROM task_priorities WHERE value = 1)),
                _project_id,
                _reporter_id,
                (_body ->> 'start')::TIMESTAMPTZ,
                (_body ->> 'end')::TIMESTAMPTZ,
                (_body ->> 'total_minutes')::NUMERIC,
                (_body ->> 'maximum_approved_minutes')::NUMERIC,
                (_body ->> 'description')::TEXT,
                (_body ->> 'parent_task_id')::UUID,
                (_body ->> 'status_id')::UUID,
                COALESCE((SELECT MAX(sort_order) + 1 FROM tasks WHERE project_id = _project_id), 0))
        RETURNING id INTO _task_id;

        -- Insert task assignees from the request.
        FOR _assignee IN SELECT * FROM JSON_ARRAY_ELEMENTS((_body ->> 'assignees')::JSON)
            LOOP
                _assignee_id = TRIM('"' FROM _assignee)::UUID;
                PERFORM create_task_assignee(_assignee_id, _project_id, _task_id, _reporter_id);

                IF _assignee_id IN (
                    SELECT id FROM team_members WHERE user_id = _reporter_id
                ) THEN
                    _already_assigned := TRUE;
                END IF;
            END LOOP;

        FOR _attachment_id IN SELECT * FROM JSON_ARRAY_ELEMENTS((_body ->> 'attachments')::JSON)
            LOOP
                UPDATE task_attachments SET task_id = _task_id WHERE id = TRIM('"' FROM _attachment_id)::UUID;
            END LOOP;

        FOR _label IN SELECT * FROM JSON_ARRAY_ELEMENTS((_body ->> 'labels')::JSON)
            LOOP
                PERFORM assign_or_create_label(_team_id, _task_id, (_label ->> 'name')::TEXT, (_label ->> 'color')::TEXT);
            END LOOP;

        -- Auto-assign the creator unless they were explicitly assigned already.
        IF _already_assigned IS FALSE THEN
            SELECT auto_assign_task_creator INTO _auto_assign_task_creator
            FROM projects
            WHERE id = _project_id;

            IF _auto_assign_task_creator IS TRUE THEN
                SELECT tm.id, (r.admin_role OR r.owner) INTO _team_member_id, _is_admin
                FROM team_members tm
                INNER JOIN roles r ON tm.role_id = r.id
                WHERE tm.user_id = _reporter_id
                  AND tm.team_id = _team_id;

                IF _team_member_id IS NOT NULL THEN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM project_members
                        WHERE project_id = _project_id
                          AND team_member_id = _team_member_id
                    ) THEN
                        IF _is_admin IS TRUE THEN
                            PERFORM create_task_assignee(_team_member_id, _project_id, _task_id, _reporter_id);
                        END IF;
                    ELSE
                        PERFORM create_task_assignee(_team_member_id, _project_id, _task_id, _reporter_id);
                    END IF;
                END IF;
            END IF;
        END IF;

        RETURN JSON_BUILD_OBJECT(
            'id', _task_id,
            'name', (_body ->> 'name')::TEXT,
            'assignees', (SELECT get_task_assignees(_task_id))
            );
    END;
    $$;

    -- 2. Update update_task to support maximum_approved_minutes
    CREATE OR REPLACE FUNCTION update_task(_body json) RETURNS json
        LANGUAGE plpgsql
    AS
    $$
    DECLARE
        _assignee      TEXT;
        _assignee_id   UUID;
        _label         JSON;
        _old_assignees JSON;
        _new_assignees JSON;
    BEGIN
        UPDATE tasks
        SET name                     = TRIM((_body ->> 'name')::TEXT),
            start_date               = (_body ->> 'start')::TIMESTAMPTZ,
            end_date                 = (_body ->> 'end')::TIMESTAMPTZ,
            priority_id              = (_body ->> 'priority_id')::UUID,
            description              = COALESCE(TRIM((_body ->> 'description')::TEXT), description),
            total_minutes            = (_body ->> 'total_minutes')::NUMERIC,
            maximum_approved_minutes = (_body ->> 'maximum_approved_minutes')::NUMERIC,
            status_id                = (_body ->> 'status_id')::UUID
        WHERE id = (_body ->> 'id')::UUID;

        SELECT COALESCE(ARRAY_TO_JSON(ARRAY_AGG(ROW_TO_JSON(rec))), '[]'::JSON)
        INTO _old_assignees
        FROM (
                 SELECT team_member_id,
                        (SELECT user_id FROM team_members WHERE id = tasks_assignees.team_member_id),
                        (SELECT team_id FROM team_members WHERE id = tasks_assignees.team_member_id)
                 FROM tasks_assignees
                 WHERE task_id = (_body ->> 'id')::UUID
             ) rec;

        -- delete existing task assignees
        DELETE FROM tasks_assignees WHERE task_id = (_body ->> 'id')::UUID;

        -- insert task assignees
        FOR _assignee IN SELECT * FROM JSON_ARRAY_ELEMENTS((_body ->> 'assignees')::JSON)
            LOOP
                _assignee_id = TRIM('"' FROM _assignee)::UUID;
                PERFORM create_task_assignee(_assignee_id, (_body ->> 'project_id')::UUID, (_body ->> 'id')::UUID,
                                             (_body ->> 'reporter_id')::UUID);
            END LOOP;

        IF ((_body ->> 'inline')::BOOLEAN IS FALSE)
        THEN
            DELETE FROM task_labels WHERE task_id = (_body ->> 'id')::UUID;
            FOR _label IN SELECT * FROM JSON_ARRAY_ELEMENTS((_body ->> 'labels')::JSON)
                LOOP
                    PERFORM assign_or_create_label((_body ->> 'team_id')::UUID, (_body ->> 'id')::UUID,
                                                   (_label ->> 'name')::TEXT,
                                                   (_label ->> 'color')::TEXT);
                END LOOP;
        END IF;

        SELECT COALESCE(ARRAY_TO_JSON(ARRAY_AGG(ROW_TO_JSON(rec))), '[]'::JSON)
        INTO _new_assignees
        FROM (
                 SELECT team_member_id,
                        (SELECT user_id FROM team_members WHERE id = tasks_assignees.team_member_id),
                        (SELECT team_id FROM team_members WHERE id = tasks_assignees.team_member_id)
                 FROM tasks_assignees
                 WHERE task_id = (_body ->> 'id')::UUID
             ) rec;

        RETURN JSON_BUILD_OBJECT(
            'id', (_body ->> 'id')::UUID,
            'name', (_body ->> 'name')::TEXT,
            'old_assignees', _old_assignees,
            'new_assignees', _new_assignees
            );
    END;
    $$;

    -- 3. Update get_task_form_view_model to include maximum_approved_minutes and latest approval status
    CREATE OR REPLACE FUNCTION get_task_form_view_model(_user_id uuid, _team_id uuid, _task_id uuid, _project_id uuid) RETURNS json
        LANGUAGE plpgsql
    AS
    $$
    DECLARE
        _task         JSON;
        _priorities   JSON;
        _projects     JSON;
        _statuses     JSON;
        _team_members JSON;
        _assignees    JSON;
        _phases       JSON;
        _custom_columns JSON;
        _custom_column_values JSON;
    BEGIN
        SELECT COALESCE(ROW_TO_JSON(rec), '{}'::JSON)
        INTO _task
        FROM (SELECT id,
                     name,
                     description,
                     start_date,
                     end_date,
                     due_time,
                     done,
                     total_minutes,
                     maximum_approved_minutes,
                     (SELECT status FROM task_time_approvals WHERE task_id = tasks.id ORDER BY submitted_at DESC LIMIT 1) AS latest_time_approval_status,
                     priority_id,
                     project_id,
                     created_at,
                     updated_at,
                     completed_at,
                     status_id,
                     parent_task_id,
                     sort_order,
                     (SELECT phase_id FROM task_phase WHERE task_id = tasks.id) AS phase_id,
                     CONCAT((SELECT key FROM projects WHERE id = tasks.project_id), '-', task_no) AS task_key,
                     (SELECT start_time
                      FROM task_timers
                      WHERE task_id = tasks.id
                        AND user_id = _user_id) AS timer_start_time,
                     parent_task_id IS NOT NULL AS is_sub_task,
                     (SELECT COUNT('*')
                      FROM tasks
                      WHERE parent_task_id = tasks.id
                        AND archived IS FALSE) AS sub_tasks_count,
                     (SELECT COUNT(*)
                      FROM tasks_with_status_view tt
                      WHERE (tt.parent_task_id = tasks.id OR tt.task_id = tasks.id)
                        AND tt.is_done IS TRUE)
                          AS completed_count,
                     (SELECT COUNT(*) FROM task_attachments WHERE task_id = tasks.id) AS attachments_count,
                     (SELECT COALESCE(ARRAY_TO_JSON(ARRAY_AGG(ROW_TO_JSON(r))), '[]'::JSON)
                      FROM (SELECT task_labels.label_id AS id,
                                   (SELECT name FROM team_labels WHERE id = task_labels.label_id),
                                   (SELECT color_code FROM team_labels WHERE id = task_labels.label_id)
                            FROM task_labels
                            WHERE task_id = tasks.id
                            ORDER BY name) r) AS labels,
                     (SELECT color_code
                      FROM sys_task_status_categories
                      WHERE id = (SELECT category_id FROM task_statuses WHERE id = tasks.status_id)) AS status_color,
                     (SELECT color_code_dark
                      FROM sys_task_status_categories
                      WHERE id = (SELECT category_id FROM task_statuses WHERE id = tasks.status_id)) AS status_color_dark,
                     (SELECT COUNT(*) FROM tasks WHERE parent_task_id = _task_id) AS sub_tasks_count,
                     (SELECT name FROM users WHERE id = tasks.reporter_id) AS reporter,
                     (SELECT get_task_assignees(tasks.id)) AS assignees,
                     (SELECT id FROM team_members WHERE user_id = _user_id AND team_id = _team_id) AS team_member_id,
                     billable,
                     schedule_id
              FROM tasks
              WHERE tasks.id = _task_id) rec;

        SELECT COALESCE(ARRAY_TO_JSON(ARRAY_AGG(ROW_TO_JSON(rec))), '[]'::JSON)
        INTO _priorities
        FROM (SELECT id, name, value, color_code
              FROM task_priorities
              ORDER BY value) rec;

        SELECT COALESCE(ARRAY_TO_JSON(ARRAY_AGG(ROW_TO_JSON(rec))), '[]'::JSON)
        INTO _projects
        FROM (SELECT id, name, color_code
              FROM projects
              WHERE team_id = _team_id
                AND archived IS FALSE
              ORDER BY name) rec;

        SELECT COALESCE(ARRAY_TO_JSON(ARRAY_AGG(ROW_TO_JSON(rec))), '[]'::JSON)
        INTO _statuses
        FROM (SELECT id,
                     name,
                     (SELECT color_code
                      FROM sys_task_status_categories
                      WHERE id = task_statuses.category_id) AS color_code,
                     (SELECT color_code_dark
                      FROM sys_task_status_categories
                      WHERE id = task_statuses.category_id) AS color_code_dark
              FROM task_statuses
              WHERE project_id = (SELECT project_id FROM tasks WHERE tasks.id = _task_id)
                 OR project_id = _project_id
              ORDER BY sort_order) rec;

        SELECT COALESCE(ARRAY_TO_JSON(ARRAY_AGG(ROW_TO_JSON(rec))), '[]'::JSON)
        INTO _team_members
        FROM (SELECT id,
                     name,
                     color_code,
                     avatar_url
              FROM team_members_view
              WHERE team_id = _team_id
              ORDER BY name) rec;

        SELECT COALESCE(ARRAY_TO_JSON(ARRAY_AGG(ROW_TO_JSON(rec))), '[]'::JSON)
        INTO _phases
        FROM (SELECT id, name, color_code
              FROM project_phases
              WHERE project_id = (SELECT project_id FROM tasks WHERE tasks.id = _task_id)
                 OR project_id = _project_id
              ORDER BY name) rec;

        RETURN JSON_BUILD_OBJECT(
            'task', _task,
            'priorities', _priorities,
            'projects', _projects,
            'statuses', _statuses,
            'team_members', _team_members,
            'phases', _phases
            );
    END;
    $$;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async (_pgm) => {
  // No-op rollback for procedure changes
};

import fs from "fs";
import path from "path";

const backendRoot = path.join(__dirname, "../..");
const requiredTables = [
  "import_jobs",
  "import_hierarchy_mappings",
  "import_field_mappings",
  "import_value_mappings",
  "import_user_mappings",
  "import_attachment_plans",
  "import_stage_tasks",
  "import_logs",
];

describe("import schema", () => {
  it.each(requiredTables)("includes %s in the fresh database snapshot", table => {
    const schema = fs.readFileSync(
      path.join(backendRoot, "database/sql/1_tables.sql"),
      "utf8",
    );

    expect(schema.includes(`CREATE TABLE IF NOT EXISTS ${table} (`)).toBe(true);
  });

  it.each(requiredTables)("includes %s in an upgrade migration", table => {
    const migrationDir = path.join(backendRoot, "database/pg-migrations");
    const migrations = fs
      .readdirSync(migrationDir)
      .filter(file => file.endsWith(".js"))
      .map(file => fs.readFileSync(path.join(migrationDir, file), "utf8"))
      .join("\n");

    expect(migrations.includes(`CREATE TABLE IF NOT EXISTS ${table} (`)).toBe(true);
  });
});

describe("authentication schema", () => {
  it.each(["licensing_plan_tiers", "licensing_plan_trials"])(
    "includes %s in the fresh licensing snapshot",
    table => {
      const schema = fs.readFileSync(
        path.join(backendRoot, "database/sql/licensing_tables.sql"),
        "utf8",
      );

      expect(schema).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
    },
  );

  it.each(["business_plan_override", "team_member_limit_override"])(
    "includes organizations.%s in the fresh database snapshot",
    column => {
      const schema = fs.readFileSync(
        path.join(backendRoot, "database/sql/1_tables.sql"),
        "utf8",
      );
      const organizations = schema.match(
        /CREATE TABLE IF NOT EXISTS organizations \(([\s\S]*?)\n\);/,
      )?.[1];

      expect(organizations).toContain(column);
    },
  );
});

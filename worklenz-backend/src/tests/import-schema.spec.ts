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

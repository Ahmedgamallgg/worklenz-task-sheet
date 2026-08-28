import fs from "fs";
import path from "path";

const backendRoot = path.join(__dirname, "../..");
const migrationsDir = path.join(backendRoot, "database/pg-migrations");

function defaultPriorityTrigger(source: string): string {
  return source.match(
    /CREATE OR REPLACE FUNCTION set_project_default_priority_trigger_fn\(\) RETURNS TRIGGER AS([\s\S]*?)\$\$ LANGUAGE plpgsql/,
  )?.[1] ?? "";
}

describe("project priority schema", () => {
  it("uses system project priorities in fresh and migrated databases", () => {
    const schemaTrigger = defaultPriorityTrigger(
      fs.readFileSync(
        path.join(backendRoot, "database/sql/triggers.sql"),
        "utf8",
      ),
    );
    const repairMigration = fs.readFileSync(
      path.join(
        migrationsDir,
        "1787945600000_fix_project_default_priority_trigger.js",
      ),
      "utf8",
    );

    expect(schemaTrigger).toContain("FROM sys_project_priorities");
    expect(schemaTrigger).not.toContain("FROM task_priorities");
    expect(defaultPriorityTrigger(repairMigration)).toContain(
      "FROM sys_project_priorities",
    );
  });
});

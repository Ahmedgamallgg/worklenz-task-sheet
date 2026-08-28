import fs from "fs";
import path from "path";

const backendRoot = path.join(__dirname, "../..");
const migrationsDir = path.join(backendRoot, "database/pg-migrations");

describe("Apple authentication schema", () => {
  it("includes users.apple_id in the fresh database snapshot", () => {
    const schema = fs.readFileSync(
      path.join(backendRoot, "database/sql/1_tables.sql"),
      "utf8",
    );
    const users = schema.match(
      /CREATE TABLE IF NOT EXISTS users \(([\s\S]*?)\n\);/,
    )?.[1];

    expect(users).toMatch(/\bapple_id\s+TEXT\b/);
  });

  it("repairs users.apple_id after the original migration baseline", () => {
    const repairMigrations = fs
      .readdirSync(migrationsDir)
      .filter(file => Number.parseInt(file, 10) > 1763049600000)
      .map(file => fs.readFileSync(path.join(migrationsDir, file), "utf8"))
      .join("\n");

    expect(repairMigrations).toContain(
      "ADD COLUMN IF NOT EXISTS apple_id TEXT",
    );
  });
});

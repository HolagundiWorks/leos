import { existsSync } from "node:fs";
import Database from "./sqlite";
import type { RuntimeStatus } from "./contracts";

export function inspectDatabase(
  databasePath: string,
): RuntimeStatus["database"] {
  if (!existsSync(databasePath)) {
    return {
      path: databasePath,
      exists: false,
      readable: false,
      schemaVersion: null,
    };
  }

  try {
    const database = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      const row = database.prepare("PRAGMA user_version").get() as {
        user_version: number;
      };
      return {
        path: databasePath,
        exists: true,
        readable: true,
        schemaVersion: row.user_version,
      };
    } finally {
      database.close();
    }
  } catch (error) {
    return {
      path: databasePath,
      exists: true,
      readable: false,
      schemaVersion: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

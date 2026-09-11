import { existsSync } from "node:fs";
import {
  DatabaseSync,
  StatementSync,
  backup as backupDatabase,
  type SQLInputValue,
} from "node:sqlite";

type BindValue = unknown;
type Row = Record<string, unknown>;

function bind(value: BindValue): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    ArrayBuffer.isView(value)
  )
    return value as SQLInputValue;
  throw new TypeError(`Unsupported SQLite bind value: ${typeof value}`);
}

class Statement {
  private plucked = false;
  public constructor(private readonly statement: StatementSync) {}

  public pluck(enabled = true): this {
    this.plucked = enabled;
    return this;
  }

  public run(...parameters: BindValue[]) {
    const result = this.statement.run(...parameters.map(bind));
    return {
      changes: Number(result.changes),
      lastInsertRowid: Number(result.lastInsertRowid),
    };
  }

  public get(...parameters: BindValue[]): unknown {
    const row = this.statement.get(...parameters.map(bind)) as Row | undefined;
    return this.plucked && row ? Object.values(row)[0] : row;
  }

  public all(...parameters: BindValue[]): unknown[] {
    const rows = this.statement.all(...parameters.map(bind)) as Row[];
    return this.plucked ? rows.map((row) => Object.values(row)[0]) : rows;
  }

  public *iterate(...parameters: BindValue[]): IterableIterator<unknown> {
    for (const row of this.statement.iterate(
      ...parameters.map(bind),
    ) as Iterable<Row>)
      yield this.plucked ? Object.values(row)[0] : row;
  }
}

class Database {
  private readonly database: DatabaseSync;

  public constructor(
    filename: string,
    options: { readonly?: boolean; fileMustExist?: boolean } = {},
  ) {
    if (
      options.fileMustExist &&
      filename !== ":memory:" &&
      !existsSync(filename)
    )
      throw new Error(`SQLite database does not exist: ${filename}`);
    this.database = new DatabaseSync(filename, {
      readOnly: options.readonly ?? false,
      enableForeignKeyConstraints: true,
    });
  }

  public prepare(sql: string): Statement {
    return new Statement(this.database.prepare(sql));
  }

  public exec(sql: string): void {
    this.database.exec(sql);
  }

  public pragma(sql: string): unknown {
    if (sql.includes("=")) {
      this.database.exec(`PRAGMA ${sql}`);
      return undefined;
    }
    return this.database.prepare(`PRAGMA ${sql}`).all();
  }

  public transaction<T extends (...parameters: never[]) => unknown>(
    operation: T,
  ): T {
    return ((...parameters: never[]) => {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        const result = operation(...parameters);
        this.database.exec("COMMIT");
        return result;
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    }) as T;
  }

  public backup(destination: string): Promise<number> {
    return backupDatabase(this.database, destination);
  }

  public close(): void {
    this.database.close();
  }
}

namespace Database {
  export type Database = InstanceType<typeof import("./sqlite").default>;
}

export default Database;

import { randomUUID } from "node:crypto";
import Database from "./sqlite";
import { compare } from "bcryptjs";
import {
  loginInputSchema,
  loginResultSchema,
  schoolSummarySchema,
  userSchema,
  type DesktopUser,
  type LoginInput,
  type LoginResult,
  type SchoolSummary,
} from "./contracts";

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  name: string | null;
  level?: number | null;
}

interface SchoolRow {
  id: number;
  name: string | null;
  academic_year: string | null;
  type: string | null;
}

export interface AccountContext {
  id: number;
  role: string;
  level: number;
}

export class AuthService {
  private readonly sessions = new Map<string, number>();
  private unlocked = false;

  public constructor(private readonly databasePath: () => string) {}

  public inspectSchool(): SchoolSummary {
    return this.withDatabase((database) => {
      const row = database
        .prepare(
          "SELECT id, name, academic_year, type FROM schools ORDER BY id LIMIT 1",
        )
        .get() as SchoolRow | undefined;
      if (!row)
        throw new Error("No school record exists in the active database.");
      return schoolSummarySchema.parse({
        id: row.id,
        name: row.name ?? "School",
        academicYear: row.academic_year,
        institutionType: row.type,
        databasePath: this.databasePath(),
      });
    });
  }

  public async login(input: LoginInput): Promise<LoginResult> {
    if (!this.unlocked)
      throw new Error("Unlock the active school before signing in.");
    const credentials = loginInputSchema.parse(input);
    const row = this.withDatabase(
      (database) =>
        database
          .prepare(
            `SELECT id, username, password_hash, role, name
           FROM users WHERE username = ? COLLATE NOCASE`,
          )
          .get(credentials.username) as UserRow | undefined,
    );

    if (!row || !(await compare(credentials.password, row.password_hash))) {
      throw new Error("Invalid credentials.");
    }

    const token = randomUUID();
    this.sessions.set(token, row.id);
    return loginResultSchema.parse({ token, user: this.toUser(row) });
  }

  public me(token: string): DesktopUser {
    const userId = this.sessions.get(token);
    if (!userId) throw new Error("Invalid or expired session.");
    return this.withDatabase((database) => {
      const row = database
        .prepare(
          "SELECT id, username, password_hash, role, name FROM users WHERE id = ?",
        )
        .get(userId) as UserRow | undefined;
      if (!row) {
        this.sessions.delete(token);
        throw new Error("Invalid or expired session.");
      }
      return this.toUser(row);
    });
  }

  public requireUserId(token: string | null | undefined): number {
    if (!token) throw new Error("Authentication required.");
    const userId = this.sessions.get(token);
    if (!userId) throw new Error("Invalid or expired session.");
    return userId;
  }

  public requireLevel(
    token: string | null | undefined,
    maximumLevel: number,
  ): number {
    const context = this.accountContext(token);
    if (context.level > maximumLevel)
      throw new Error("Insufficient privileges.");
    return context.id;
  }

  public accountContext(token: string | null | undefined): AccountContext {
    const userId = this.requireUserId(token);
    return this.withDatabase((database) => {
      const row = database
        .prepare("SELECT level, role FROM users WHERE id = ?")
        .get(userId) as { level: number | null; role: string } | undefined;
      if (!row) throw new Error("Invalid or expired session.");
      return {
        id: userId,
        role: row.role,
        level: row.level ?? this.profileLevel(row.role),
      };
    });
  }

  public logout(token: string): void {
    this.sessions.delete(token);
  }

  public acceptVerifiedSchool(): void {
    this.sessions.clear();
    this.unlocked = true;
  }

  public async unlock(masterKey: string): Promise<void> {
    const hash = this.withDatabase(
      (database) =>
        database
          .prepare("SELECT value FROM meta WHERE key = 'master_key_hash'")
          .pluck()
          .get() as string | undefined,
    );
    if (!hash || !(await compare(masterKey, hash))) {
      throw new Error("Invalid master key.");
    }
    this.sessions.clear();
    this.unlocked = true;
  }

  private toUser(row: UserRow): DesktopUser {
    return userSchema.parse({
      id: row.id,
      username: row.username,
      profile: row.role,
      name: row.name ?? row.username,
    });
  }

  private profileLevel(profile: string): number {
    if (["principal", "admin"].includes(profile)) return 1;
    if (
      [
        "teacher",
        "timetable_coord",
        "exam_coord",
        "accountant",
        "front_office",
      ].includes(profile)
    )
      return 2;
    if (profile === "class_teacher") return 3;
    if (profile === "staff") return 4;
    return 5;
  }

  private withDatabase<T>(operation: (database: Database.Database) => T): T {
    const database = new Database(this.databasePath(), {
      readonly: true,
      fileMustExist: true,
    });
    try {
      return operation(database);
    } finally {
      database.close();
    }
  }
}

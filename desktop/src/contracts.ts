import { z } from "zod";

export const IPC_CHANNELS = {
  runtimeStatus: "app:getRuntimeStatus",
  schoolInspect: "school:inspectActive",
  schoolUnlock: "school:unlockActive",
  schoolOpen: "school:openArchive",
  schoolSave: "school:saveArchive",
  schoolCreate: "school:createArchive",
  authLogin: "auth:login",
  authMe: "auth:me",
  authLogout: "auth:logout",
  apiRequest: "api:request",
  dialogOpenSchool: "dialog:openSchool",
  dialogOpenImport: "dialog:openImport",
  dialogOpenFolder: "dialog:openFolder",
  dialogSaveSchool: "dialog:saveSchool",
  lanStatus: "lan:status",
  lanStart: "lan:start",
  lanStop: "lan:stop",
  lanConnect: "lan:connect",
  lanDisconnect: "lan:disconnect",
} as const;

export const apiRequestSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().startsWith("/").max(512),
  token: z.string().uuid().nullable().optional(),
  body: z.unknown().optional(),
  source: z.enum(["local", "lan", "lan-web", "lan-android"]).optional(),
});

export const apiResponseSchema = z.object({
  status: z.number().int().min(100).max(599),
  body: z.unknown(),
});

export const userSchema = z.object({
  id: z.number().int().positive(),
  username: z.string(),
  profile: z.string(),
  name: z.string(),
});

export const schoolSummarySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  academicYear: z.string().nullable(),
  institutionType: z.string().nullable(),
  databasePath: z.string(),
});

export const loginInputSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export const unlockInputSchema = z.object({ masterKey: z.string().min(1) });
export const openSchoolInputSchema = z.object({
  path: z.string().trim().min(1),
  masterKey: z.string(),
});
export const openSchoolResultSchema = z.object({
  opened: z.string(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  school: schoolSummarySchema,
});
export const saveSchoolInputSchema = z.object({
  path: z.string().trim().min(1),
});
export const saveSchoolResultSchema = z.object({
  path: z.string(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
});
export const createSchoolInputSchema = z.object({
  path: z.string().trim().min(1),
  schoolName: z.string().trim().min(1),
  institutionType: z.enum(["school", "pre-school", "college", "puc"]),
  academicYear: z.string().trim().min(1),
  masterKey: z.string().min(8),
  adminPassword: z.string().min(8),
});

export const loginResultSchema = z.object({
  token: z.string().uuid(),
  user: userSchema,
});

export const tokenInputSchema = z.object({ token: z.string().uuid() });

export const runtimeStatusSchema = z.object({
  appVersion: z.string(),
  platform: z.string(),
  dataDirectory: z.string(),
  database: z.object({
    path: z.string(),
    exists: z.boolean(),
    readable: z.boolean(),
    schemaVersion: z.number().int().nullable(),
    error: z.string().optional(),
  }),
});

export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>;
export type SchoolSummary = z.infer<typeof schoolSummarySchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type LoginResult = z.infer<typeof loginResultSchema>;
export type DesktopUser = z.infer<typeof userSchema>;
export type ApiRequest = z.infer<typeof apiRequestSchema>;
export type ApiResponse = z.infer<typeof apiResponseSchema>;
export type OpenSchoolInput = z.infer<typeof openSchoolInputSchema>;
export type OpenSchoolResult = z.infer<typeof openSchoolResultSchema>;
export type SaveSchoolResult = z.infer<typeof saveSchoolResultSchema>;
export type CreateSchoolInput = z.infer<typeof createSchoolInputSchema>;
export const lanStatusSchema = z.object({
  mode: z.enum(["off", "host", "client"]),
  running: z.boolean(),
  port: z.number(),
  addresses: z.array(z.string()),
  pairingCode: z.string().nullable(),
  remoteUrl: z.string().nullable(),
  connected: z.boolean(),
  lastError: z.string().nullable(),
});
export type LanStatus = z.infer<typeof lanStatusSchema>;

export interface LeosDesktopBridge {
  getRuntimeStatus(): Promise<RuntimeStatus>;
  inspectActiveSchool(): Promise<SchoolSummary>;
  unlockActiveSchool(masterKey: string): Promise<void>;
  openSchoolArchive(input: OpenSchoolInput): Promise<OpenSchoolResult>;
  saveSchoolArchive(path: string): Promise<SaveSchoolResult>;
  createSchoolArchive(input: CreateSchoolInput): Promise<OpenSchoolResult>;
  login(input: LoginInput): Promise<LoginResult>;
  me(token: string): Promise<DesktopUser>;
  logout(token: string): Promise<void>;
  request(input: ApiRequest): Promise<ApiResponse>;
  chooseSchoolFile(): Promise<string | null>;
  chooseImportFile(kind: "csv" | "database"): Promise<string | null>;
  chooseFolder(): Promise<string | null>;
  chooseNewSchoolFile(defaultName: string): Promise<string | null>;
  lanStatus(): Promise<LanStatus>;
  lanStart(port: number): Promise<LanStatus>;
  lanStop(): Promise<LanStatus>;
  lanConnect(url: string, pairingCode: string): Promise<LanStatus>;
  lanDisconnect(): Promise<LanStatus>;
}

interface LeosRuntimeStatus {
  appVersion: string;
  platform: string;
  dataDirectory: string;
  database: {
    path: string;
    exists: boolean;
    readable: boolean;
    schemaVersion: number | null;
    error?: string;
  };
}

interface Window {
  leosDesktop?: {
    getRuntimeStatus(): Promise<LeosRuntimeStatus>;
    inspectActiveSchool(): Promise<{
      id: number;
      name: string;
      academicYear: string | null;
      institutionType: string | null;
      databasePath: string;
    }>;
    unlockActiveSchool(masterKey: string): Promise<void>;
    openSchoolArchive(input: { path: string; masterKey: string }): Promise<{
      opened: string;
      checksum: string;
      school: {
        id: number;
        name: string;
        academicYear: string | null;
        institutionType: string | null;
        databasePath: string;
      };
    }>;
    saveSchoolArchive(
      path: string,
    ): Promise<{ path: string; checksum: string }>;
    createSchoolArchive(input: {
      path: string;
      schoolName: string;
      institutionType: "school" | "pre-school" | "college" | "puc";
      academicYear: string;
      masterKey: string;
      adminPassword: string;
    }): Promise<{
      opened: string;
      checksum: string;
      school: {
        id: number;
        name: string;
        academicYear: string | null;
        institutionType: string | null;
        databasePath: string;
      };
    }>;
    login(input: { username: string; password: string }): Promise<{
      token: string;
      user: { id: number; username: string; profile: string; name: string };
    }>;
    me(
      token: string,
    ): Promise<{ id: number; username: string; profile: string; name: string }>;
    logout(token: string): Promise<void>;
    request(input: {
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      path: string;
      token?: string | null;
      body?: unknown;
    }): Promise<{ status: number; body: unknown }>;
    chooseSchoolFile(): Promise<string | null>;
    chooseImportFile(kind: "csv" | "database"): Promise<string | null>;
    chooseFolder(): Promise<string | null>;
    chooseNewSchoolFile(defaultName: string): Promise<string | null>;
    lanStatus(): Promise<{
      mode: "off" | "host" | "client";
      running: boolean;
      port: number;
      addresses: string[];
      pairingCode: string | null;
      remoteUrl: string | null;
      connected: boolean;
      lastError: string | null;
    }>;
    lanStart(
      port: number,
    ): Promise<{
      mode: "off" | "host" | "client";
      running: boolean;
      port: number;
      addresses: string[];
      pairingCode: string | null;
      remoteUrl: string | null;
      connected: boolean;
      lastError: string | null;
    }>;
    lanStop(): Promise<{
      mode: "off" | "host" | "client";
      running: boolean;
      port: number;
      addresses: string[];
      pairingCode: string | null;
      remoteUrl: string | null;
      connected: boolean;
      lastError: string | null;
    }>;
    lanConnect(
      url: string,
      pairingCode: string,
    ): Promise<{
      mode: "off" | "host" | "client";
      running: boolean;
      port: number;
      addresses: string[];
      pairingCode: string | null;
      remoteUrl: string | null;
      connected: boolean;
      lastError: string | null;
    }>;
    lanDisconnect(): Promise<{
      mode: "off" | "host" | "client";
      running: boolean;
      port: number;
      addresses: string[];
      pairingCode: string | null;
      remoteUrl: string | null;
      connected: boolean;
      lastError: string | null;
    }>;
  };
}

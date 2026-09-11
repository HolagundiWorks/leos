import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
} from "electron";
import { join } from "node:path";
import {
  IPC_CHANNELS,
  apiRequestSchema,
  createSchoolInputSchema,
  loginInputSchema,
  openSchoolInputSchema,
  saveSchoolInputSchema,
  runtimeStatusSchema,
  tokenInputSchema,
  unlockInputSchema,
} from "./contracts";
import { inspectDatabase } from "./database";
import { AuthService } from "./auth";
import { ApiRouter } from "./api-router";
import { SchoolFileService } from "./school-files";
import { LanManager, lanConnectSchema, lanStartSchema } from "./lan-manager";

const isDevelopment = process.env.LEOS_DESKTOP_DEV === "1";

function dataDirectory(): string {
  if (process.env.LEOS_DATA_DIR) return process.env.LEOS_DATA_DIR;
  const localAppData = process.env.LOCALAPPDATA;
  return localAppData
    ? join(localAppData, "LEOS")
    : join(app.getPath("userData"), "data");
}

function databasePath(): string {
  return join(dataDirectory(), "school.sqlite");
}

function rendererDirectory(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "renderer")
    : join(__dirname, "..", "..", "frontend", "dist");
}

function assertTrustedRenderer(event: IpcMainInvokeEvent): void {
  const source = event.senderFrame?.url ?? "";
  const trusted =
    source.startsWith("file:") ||
    (isDevelopment && source.startsWith("http://localhost:5174"));
  if (!trusted)
    throw new Error("IPC request rejected from an untrusted renderer.");
}

function registerIpcHandlers(): void {
  const auth = new AuthService(databasePath);
  const api = new ApiRouter(databasePath, auth);
  const lan = new LanManager((request) => api.handle(request), rendererDirectory());
  const schoolFiles = new SchoolFileService(databasePath);
  ipcMain.handle(IPC_CHANNELS.runtimeStatus, (event) => {
    assertTrustedRenderer(event);
    const directory = dataDirectory();
    return runtimeStatusSchema.parse({
      appVersion: app.getVersion(),
      platform: process.platform,
      dataDirectory: directory,
      database: inspectDatabase(databasePath()),
    });
  });
  ipcMain.handle(IPC_CHANNELS.schoolInspect, (event) => {
    assertTrustedRenderer(event);
    return auth.inspectSchool();
  });
  ipcMain.handle(IPC_CHANNELS.schoolUnlock, async (event, input: unknown) => {
    assertTrustedRenderer(event);
    const { masterKey } = unlockInputSchema.parse(input);
    await auth.unlock(masterKey);
    schoolFiles.migrateActiveDatabase();
  });
  ipcMain.handle(IPC_CHANNELS.schoolOpen, async (event, input: unknown) => {
    assertTrustedRenderer(event);
    const result = await schoolFiles.openArchive(
      openSchoolInputSchema.parse(input),
    );
    auth.acceptVerifiedSchool();
    return result;
  });
  ipcMain.handle(IPC_CHANNELS.schoolSave, async (event, input: unknown) => {
    assertTrustedRenderer(event);
    const { path } = saveSchoolInputSchema.parse(input);
    return schoolFiles.saveArchive(path);
  });
  ipcMain.handle(IPC_CHANNELS.schoolCreate, async (event, input: unknown) => {
    assertTrustedRenderer(event);
    const result = await schoolFiles.createArchive(
      createSchoolInputSchema.parse(input),
    );
    auth.acceptVerifiedSchool();
    return result;
  });
  ipcMain.handle(IPC_CHANNELS.authLogin, (event, input: unknown) => {
    assertTrustedRenderer(event);
    const credentials = loginInputSchema.parse(input);
    if (lan.status().mode === "client")
      return lan
        .forward({ method: "POST", path: "/auth/login", body: credentials })
        .then((r) => {
          if (r.status >= 400)
            throw new Error(
              (r.body as { error?: string }).error ?? "LAN login failed",
            );
          return r.body;
        });
    return auth.login(credentials);
  });
  ipcMain.handle(IPC_CHANNELS.authMe, (event, input: unknown) => {
    assertTrustedRenderer(event);
    const { token } = tokenInputSchema.parse(input);
    if (lan.status().mode === "client")
      return lan
        .forward({ method: "GET", path: "/auth/me", token })
        .then((r) => (r.body as { user: unknown }).user);
    return auth.me(token);
  });
  ipcMain.handle(IPC_CHANNELS.authLogout, async (event, input: unknown) => {
    assertTrustedRenderer(event);
    const { token } = tokenInputSchema.parse(input);
    if (lan.status().mode === "client") {
      const response = await lan.forward({
        method: "POST",
        path: "/auth/logout",
        token,
      });
      if (response.status >= 400)
        throw new Error(
          (response.body as { error?: string }).error ?? "LAN logout failed",
        );
      return;
    }
    auth.logout(token);
  });
  ipcMain.handle(IPC_CHANNELS.apiRequest, (event, input: unknown) => {
    assertTrustedRenderer(event);
    return lan.forward(apiRequestSchema.parse(input));
  });
  ipcMain.handle(IPC_CHANNELS.lanStatus, (event) => {
    assertTrustedRenderer(event);
    return lan.status();
  });
  ipcMain.handle(IPC_CHANNELS.lanStart, (event, input) => {
    assertTrustedRenderer(event);
    return lan.start(lanStartSchema.parse(input).port);
  });
  ipcMain.handle(IPC_CHANNELS.lanStop, (event) => {
    assertTrustedRenderer(event);
    return lan.stop();
  });
  ipcMain.handle(IPC_CHANNELS.lanConnect, (event, input) => {
    assertTrustedRenderer(event);
    const v = lanConnectSchema.parse(input);
    return lan.connect(v.url, v.pairingCode);
  });
  ipcMain.handle(IPC_CHANNELS.lanDisconnect, (event) => {
    assertTrustedRenderer(event);
    return lan.disconnect();
  });
  ipcMain.handle(IPC_CHANNELS.dialogOpenSchool, async (event) => {
    assertTrustedRenderer(event);
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "LEOS school files", extensions: ["leosdb"] }],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle(
    IPC_CHANNELS.dialogOpenImport,
    async (event, kind: unknown) => {
      assertTrustedRenderer(event);
      if (kind !== "csv" && kind !== "database")
        throw new Error("Invalid import file type.");
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters:
          kind === "csv"
            ? [{ name: "CSV files", extensions: ["csv"] }]
            : [
                {
                  name: "LEOS and SQLite files",
                  extensions: ["leosdb", "sqlite", "db"],
                },
              ],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  );
  ipcMain.handle(IPC_CHANNELS.dialogOpenFolder, async (event) => {
    assertTrustedRenderer(event);
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle(
    IPC_CHANNELS.dialogSaveSchool,
    async (event, defaultName: unknown) => {
      assertTrustedRenderer(event);
      const name =
        typeof defaultName === "string" && defaultName.trim()
          ? defaultName
          : "School.leosdb";
      const result = await dialog.showSaveDialog({
        defaultPath: name,
        filters: [{ name: "LEOS school files", extensions: ["leosdb"] }],
      });
      return result.canceled ? null : (result.filePath ?? null);
    },
  );
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    title: "LEOS — Learning Environment Operating System",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url === "about:blank") {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const allowed =
      url.startsWith("file:") ||
      (isDevelopment && url.startsWith("http://localhost:5174"));
    if (!allowed) event.preventDefault();
  });

  if (isDevelopment) {
    await window.loadURL(
      process.env.LEOS_RENDERER_URL ?? "http://localhost:5174",
    );
  } else {
    const renderer = app.isPackaged
      ? join(process.resourcesPath, "renderer", "index.html")
      : join(__dirname, "../../frontend/dist/index.html");
    await window.loadFile(renderer);
  }
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

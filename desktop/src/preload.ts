import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  apiRequestSchema,
  apiResponseSchema,
  createSchoolInputSchema,
  loginInputSchema,
  loginResultSchema,
  openSchoolInputSchema,
  openSchoolResultSchema,
  saveSchoolInputSchema,
  saveSchoolResultSchema,
  runtimeStatusSchema,
  schoolSummarySchema,
  tokenInputSchema,
  unlockInputSchema,
  userSchema,
  type LeosDesktopBridge,
  lanStatusSchema,
} from "./contracts";

const bridge: LeosDesktopBridge = {
  async getRuntimeStatus() {
    return runtimeStatusSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.runtimeStatus),
    );
  },
  async inspectActiveSchool() {
    return schoolSummarySchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.schoolInspect),
    );
  },
  async unlockActiveSchool(masterKey) {
    const input = unlockInputSchema.parse({ masterKey });
    await ipcRenderer.invoke(IPC_CHANNELS.schoolUnlock, input);
  },
  async openSchoolArchive(input) {
    const request = openSchoolInputSchema.parse(input);
    return openSchoolResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.schoolOpen, request),
    );
  },
  async saveSchoolArchive(path) {
    const input = saveSchoolInputSchema.parse({ path });
    return saveSchoolResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.schoolSave, input),
    );
  },
  async createSchoolArchive(input) {
    const request = createSchoolInputSchema.parse(input);
    return openSchoolResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.schoolCreate, request),
    );
  },
  async login(input) {
    const credentials = loginInputSchema.parse(input);
    return loginResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.authLogin, credentials),
    );
  },
  async me(token) {
    const input = tokenInputSchema.parse({ token });
    return userSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.authMe, input),
    );
  },
  async logout(token) {
    const input = tokenInputSchema.parse({ token });
    await ipcRenderer.invoke(IPC_CHANNELS.authLogout, input);
  },
  async request(input) {
    const request = apiRequestSchema.parse(input);
    return apiResponseSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.apiRequest, request),
    );
  },
  async chooseSchoolFile() {
    const result: unknown = await ipcRenderer.invoke(
      IPC_CHANNELS.dialogOpenSchool,
    );
    return typeof result === "string" ? result : null;
  },
  async chooseImportFile(kind) {
    const result: unknown = await ipcRenderer.invoke(
      IPC_CHANNELS.dialogOpenImport,
      kind,
    );
    return typeof result === "string" ? result : null;
  },
  async chooseFolder() {
    const result: unknown = await ipcRenderer.invoke(
      IPC_CHANNELS.dialogOpenFolder,
    );
    return typeof result === "string" ? result : null;
  },
  async chooseNewSchoolFile(defaultName) {
    const result: unknown = await ipcRenderer.invoke(
      IPC_CHANNELS.dialogSaveSchool,
      defaultName,
    );
    return typeof result === "string" ? result : null;
  },
  async lanStatus() {
    return lanStatusSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.lanStatus),
    );
  },
  async lanStart(port) {
    return lanStatusSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.lanStart, { port }),
    );
  },
  async lanStop() {
    return lanStatusSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.lanStop),
    );
  },
  async lanConnect(url, pairingCode) {
    return lanStatusSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.lanConnect, { url, pairingCode }),
    );
  },
  async lanDisconnect() {
    return lanStatusSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.lanDisconnect),
    );
  },
};

contextBridge.exposeInMainWorld("leosDesktop", bridge);

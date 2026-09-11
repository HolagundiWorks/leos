import { createServer, type Server } from "node:http";
import { networkInterfaces } from "node:os";
import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { z } from "zod";
import type { ApiRequest, ApiResponse } from "./contracts";

export interface LanStatus {
  mode: "off" | "host" | "client";
  running: boolean;
  port: number;
  addresses: string[];
  pairingCode: string | null;
  remoteUrl: string | null;
  connected: boolean;
  lastError: string | null;
}

export class LanManager {
  private server: Server | null = null;
  private pairingCode: string | null = null;
  private remoteUrl: string | null = null;
  private remoteCode: string | null = null;
  private lastError: string | null = null;
  public constructor(
    private readonly route: (request: ApiRequest) => Promise<ApiResponse>,
    private readonly rendererDirectory?: string,
  ) {}
  public status(): LanStatus {
    return {
      mode: this.server ? "host" : this.remoteUrl ? "client" : "off",
      running: !!this.server,
      port: this.serverPort(),
      addresses: this.addresses(),
      pairingCode: this.pairingCode,
      remoteUrl: this.remoteUrl,
      connected: !!this.remoteUrl,
      lastError: this.lastError,
    };
  }
  public async start(port: number): Promise<LanStatus> {
    if (this.remoteUrl)
      throw new Error("Disconnect from the remote school before hosting.");
    if (this.server) return this.status();
    this.pairingCode = randomBytes(4).toString("hex").toUpperCase();
    this.lastError = null;
    this.server = createServer(async (req, res) => {
      try {
        res.setHeader("Cache-Control", "no-store");
        const requestUrl = new URL(req.url ?? "/", "http://leos.lan");
        if (requestUrl.pathname === "/" && req.method === "GET") {
          this.servePairingPage(res);
          return;
        }
        if (requestUrl.pathname === "/__pair" && req.method === "POST") {
          const body = await this.readRequestBody(req);
          const code = new URLSearchParams(body.toString("utf8"))
            .get("code")
            ?.trim()
            .toUpperCase();
          if (code !== this.pairingCode) {
            res.statusCode = 401;
            this.servePairingPage(res, "The pairing code was rejected.");
            return;
          }
          res.statusCode = 303;
          res.setHeader("Location", "/app/");
          res.setHeader(
            "Set-Cookie",
            `leos_pair=${encodeURIComponent(code)}; HttpOnly; SameSite=Strict; Path=/`,
          );
          res.end();
          return;
        }

        const headerCode = req.headers["x-leos-pairing-code"];
        const cookieCode = this.cookie(req.headers.cookie, "leos_pair");
        if (headerCode !== this.pairingCode && cookieCode !== this.pairingCode) {
          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid LAN pairing code" }));
          return;
        }
        if (requestUrl.pathname.startsWith("/app")) {
          await this.serveRenderer(requestUrl.pathname, res);
          return;
        }
        const rawBody = await this.readRequestBody(req);
        const body = rawBody.length
          ? JSON.parse(rawBody.toString("utf8"))
          : undefined;
        const token =
          typeof req.headers.authorization === "string"
            ? req.headers.authorization.replace(/^Bearer\s+/i, "")
            : undefined;
        const result = await this.route({
          method: (req.method ?? "GET") as ApiRequest["method"],
          path: req.url ?? "/",
          token,
          body,
          source: /LEOS-Android/i.test(String(req.headers["user-agent"] ?? ""))
            ? "lan-android"
            : "lan-web",
        });
        res.setHeader("Content-Type", "application/json");
        res.statusCode = result.status;
        res.end(JSON.stringify(result.body));
      } catch (error) {
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(port, "0.0.0.0", () => resolve());
    });
    return this.status();
  }

  private async readRequestBody(req: import("node:http").IncomingMessage) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2_000_000) throw new Error("Request is too large");
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private cookie(header: string | undefined, name: string): string | null {
    for (const part of header?.split(";") ?? []) {
      const [key, ...value] = part.trim().split("=");
      if (key === name) return decodeURIComponent(value.join("="));
    }
    return null;
  }

  private servePairingPage(
    res: import("node:http").ServerResponse,
    error = "",
  ): void {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>LEOS LAN</title><style>body{font:16px system-ui;background:#f4f7fb;margin:0;display:grid;place-items:center;min-height:100vh}.card{background:white;padding:2rem;border-radius:14px;box-shadow:0 12px 35px #18315322;width:min(360px,calc(100% - 3rem))}h1{margin-top:0;color:#183153}input,button{box-sizing:border-box;width:100%;padding:.8rem;margin-top:.65rem;border-radius:8px;border:1px solid #b6c2d1}button{background:#185abd;color:white;border:0;font-weight:700}.error{color:#b42318}</style></head><body><main class="card"><h1>LEOS School Access</h1><p>Enter the temporary pairing code shown on the host computer.</p>${error ? `<p class="error">${error}</p>` : ""}<form method="post" action="/__pair"><label>Pairing code<input name="code" autocomplete="one-time-code" required minlength="6" autofocus></label><button type="submit">Open LEOS</button></form></main></body></html>`);
  }

  private async serveRenderer(
    pathname: string,
    res: import("node:http").ServerResponse,
  ): Promise<void> {
    if (!this.rendererDirectory)
      throw new Error("The LAN browser renderer is unavailable.");
    const root = resolve(this.rendererDirectory);
    const relative = pathname.replace(/^\/app\/?/, "") || "index.html";
    let file = resolve(root, normalize(relative));
    if (file !== root && !file.startsWith(`${root}${sep}`)) {
      res.statusCode = 400;
      res.end("Invalid asset path");
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    } catch {
      file = join(root, "index.html");
    }
    const types: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".mjs": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".woff2": "font/woff2",
    };
    res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
    res.end(await readFile(file));
  }
  public async stop(): Promise<LanStatus> {
    if (this.server)
      await new Promise<void>((resolve, reject) =>
        this.server!.close((e) => (e ? reject(e) : resolve())),
      );
    this.server = null;
    this.pairingCode = null;
    return this.status();
  }
  public async connect(url: string, code: string): Promise<LanStatus> {
    if (this.server)
      throw new Error("Stop hosting before connecting to another school.");
    const normalized = this.safeUrl(url);
    const response = await fetch(`${normalized}/health`, {
      headers: { "X-LEOS-Pairing-Code": code.trim().toUpperCase() },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? "Pairing code was rejected."
          : `Host returned ${response.status}`,
      );
    this.remoteUrl = normalized;
    this.remoteCode = code.trim().toUpperCase();
    this.lastError = null;
    return this.status();
  }
  public disconnect(): LanStatus {
    this.remoteUrl = null;
    this.remoteCode = null;
    return this.status();
  }
  public async forward(request: ApiRequest): Promise<ApiResponse> {
    if (!this.remoteUrl || !this.remoteCode) return this.route(request);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-LEOS-Pairing-Code": this.remoteCode,
    };
    if (request.token) headers.Authorization = `Bearer ${request.token}`;
    const response = await fetch(`${this.remoteUrl}${request.path}`, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : JSON.stringify(request.body ?? {}),
      signal: AbortSignal.timeout(15000),
    });
    const body: unknown = await response
      .json()
      .catch(() => ({ error: "Invalid response from LAN host" }));
    return { status: response.status, body };
  }
  private safeUrl(value: string): string {
    const parsed = new URL(
      /^https?:\/\//i.test(value) ? value : `http://${value}`,
    );
    if (parsed.protocol !== "http:")
      throw new Error("LAN connections must use http://.");
    const host = parsed.hostname;
    const privateHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      (/^172\.(\d+)\./.test(host) &&
        Number(host.split(".")[1]) >= 16 &&
        Number(host.split(".")[1]) <= 31);
    if (!privateHost)
      throw new Error("Enter a private LAN address, such as 192.168.1.20.");
    parsed.pathname = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  }
  private serverPort(): number {
    return this.server?.address() && typeof this.server.address() === "object"
      ? (this.server.address() as { port: number }).port
      : 8788;
  }
  private addresses(): string[] {
    const out: string[] = [];
    for (const entries of Object.values(networkInterfaces()))
      for (const entry of entries ?? [])
        if (entry.family === "IPv4" && !entry.internal)
          out.push(`http://${entry.address}:${this.serverPort()}`);
    return out;
  }
}

export const lanStartSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(8788),
});
export const lanConnectSchema = z.object({
  url: z.string().trim().min(1),
  pairingCode: z.string().trim().min(6).max(32),
});

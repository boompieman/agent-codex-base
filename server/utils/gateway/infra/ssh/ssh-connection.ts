import { readFileSync } from "node:fs";
import { Client, type ClientChannel, type SFTPWrapper } from "ssh2";
import type {
  CommandResult,
  DirectTcpChannelOptions,
  HostWithSecret,
  ShellOptions,
} from "./ssh-types";
import { createProxySocket, expandHome, resolveSshConfig, sshConnectionKey } from "./ssh-config";
import { SSH_CONNECTION_CLOSED_BEFORE_READY, withSshConnectRetries } from "./ssh-connect-retry";
import { isConnectionLevelSshError } from "./ssh-errors";
import { SftpChannelPool } from "./ssh-sftp";
import { uploadFile, uploadFileResumable } from "./ssh-transfer";
import { currentGatewayUserId } from "../../state/memory";
import { EventEmitter } from "@posva/event-emitter";

const SSH_READY_TIMEOUT_MS = 30_000;
const SSH_KEEPALIVE_INTERVAL_MS = 30_000;
const SSH_KEEPALIVE_COUNT_MAX = 10;

type SshConnectionPoolEvents = {
  ready: { userId: number; host: HostWithSecret };
};

export class SshConnectionPool extends EventEmitter<SshConnectionPoolEvents> {
  private clients = new Map<string, Promise<Client>>();
  private clientTokens = new Map<string, symbol>();
  private sftpChannels = new SftpChannelPool();
  private hostKeysByUser = new Map<string, Map<number, string>>();

  constructor() {
    super();
  }

  connect(host: HostWithSecret): Promise<Client> {
    const resolved = resolveSshConfig(host);
    const key = sshConnectionKey(host, resolved);
    this.scopedHostKeys().set(host.id, key);

    const existing = this.clients.get(key);
    if (existing) return this.notifyReady(existing, host);

    const token = Symbol(key);
    this.clientTokens.set(key, token);
    const promise = withSshConnectRetries(host, () =>
      this.connectOnce(host, resolved, key, token),
    ).catch((error) => {
      this.deleteClientIfCurrent(key, token);
      throw error;
    });

    this.clients.set(key, promise);
    return this.notifyReady(promise, host);
  }

  async execChannelIfConnected(host: HostWithSecret, command: string) {
    const key = sshConnectionKey(host, resolveSshConfig(host));
    const connection = this.clients.get(key);
    if (connection === undefined) return null;
    const client = await connection;
    return await new Promise<ClientChannel>((resolve, reject) => {
      client.exec(command, (error, channel) => (error ? reject(error) : resolve(channel)));
    });
  }

  async exec(
    host: HostWithSecret,
    command: string,
    options: { timeoutMs?: number } = {},
  ): Promise<CommandResult> {
    const channel = await this.execChannel(host, command);

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        callback();
      };
      const timer =
        options.timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              finish(() =>
                reject(new Error(`Remote command timed out after ${options.timeoutMs}ms`)),
              );
              channel.close();
            }, options.timeoutMs);
      channel.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      channel.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      channel.on("error", (error: Error) => finish(() => reject(error)));
      channel.on("close", (code: number | null) => {
        finish(() => resolve({ code, stdout, stderr }));
      });
    });
  }

  async execChannel(
    host: HostWithSecret,
    command: string,
    retried = false,
  ): Promise<ClientChannel> {
    const client = await this.connect(host);

    return new Promise((resolve, reject) => {
      client.exec(command, (error, channel) => {
        if (error) {
          this.disconnectHost(host);
          if (!retried && isConnectionLevelSshError(error)) {
            void this.execChannel(host, command, true).then(resolve, reject);
            return;
          }
          reject(error);
          return;
        }
        resolve(channel);
      });
    });
  }

  async openShell(
    host: HostWithSecret,
    options: ShellOptions,
    retried = false,
  ): Promise<ClientChannel> {
    const client = await this.connect(host);

    return new Promise((resolve, reject) => {
      client.shell(
        {
          term: options.term,
          cols: options.cols,
          rows: options.rows,
        },
        (error, channel) => {
          if (error) {
            this.disconnectHost(host);
            if (!retried && isConnectionLevelSshError(error)) {
              void this.openShell(host, options, true).then(resolve, reject);
              return;
            }
            reject(error);
            return;
          }
          resolve(channel);
        },
      );
    });
  }

  async openTcpChannel(
    host: HostWithSecret,
    target: DirectTcpChannelOptions,
    retried = false,
  ): Promise<ClientChannel> {
    const client = await this.connect(host);
    return new Promise((resolve, reject) => {
      client.forwardOut("127.0.0.1", 0, target.host, target.port, (error, channel) => {
        if (!error) {
          resolve(channel);
          return;
        }
        if (!retried && isConnectionLevelSshError(error)) {
          this.disconnectHost(host);
          void this.openTcpChannel(host, target, true).then(resolve, reject);
          return;
        }
        reject(error);
      });
    });
  }

  sftp(host: HostWithSecret): Promise<SFTPWrapper> {
    const resolved = resolveSshConfig(host);
    const key = sshConnectionKey(host, resolved);
    this.scopedHostKeys().set(host.id, key);
    return this.sftpChannels.get(host, key, () => this.connect(host));
  }

  async uploadFile(host: HostWithSecret, localPath: string, remotePath: string) {
    return await uploadFile(this, host, localPath, remotePath);
  }

  async uploadFileResumable(host: HostWithSecret, localPath: string, remotePath: string) {
    return await uploadFileResumable(this, host, localPath, remotePath);
  }

  syncHosts(hosts: HostWithSecret[]) {
    const scopedHostKeys = this.scopedHostKeys();
    const previousKeys = new Set(scopedHostKeys.values());
    const activeKeys = new Set<string>();
    scopedHostKeys.clear();
    for (const host of hosts) {
      const key = sshConnectionKey(host, resolveSshConfig(host));
      activeKeys.add(key);
      scopedHostKeys.set(host.id, key);
    }

    for (const key of previousKeys) {
      if (!activeKeys.has(key) && !this.isReferenced(key)) {
        this.disconnectKey(key);
      }
    }
  }

  disconnectHost(host: HostWithSecret) {
    const key =
      this.scopedHostKeys().get(host.id) ?? sshConnectionKey(host, resolveSshConfig(host));
    this.disconnectKey(key);
  }

  disconnect(hostId: number) {
    const scopedHostKeys = this.scopedHostKeys();
    const key = scopedHostKeys.get(hostId);
    if (key !== undefined) {
      scopedHostKeys.delete(hostId);
      if (!this.isReferenced(key)) {
        this.disconnectKey(key);
      }
    }
  }

  private disconnectKey(key: string) {
    this.sftpChannels.close(key);
    const client = this.clients.get(key);
    this.clients.delete(key);
    this.clientTokens.delete(key);
    void client?.then((connection) => connection.end()).catch(() => {});
  }

  private scopedHostKeys() {
    const scope = this.userScopeKey();
    let hostKeys = this.hostKeysByUser.get(scope);
    if (!hostKeys) {
      hostKeys = new Map();
      this.hostKeysByUser.set(scope, hostKeys);
    }
    return hostKeys;
  }

  private userScopeKey() {
    return String(currentGatewayUserId() ?? "anonymous");
  }

  private isReferenced(key: string) {
    for (const hostKeys of this.hostKeysByUser.values()) {
      for (const referencedKey of hostKeys.values()) {
        if (referencedKey === key) {
          return true;
        }
      }
    }
    return false;
  }

  private async connectOnce(
    host: HostWithSecret,
    resolved: ReturnType<typeof resolveSshConfig>,
    key: string,
    token: symbol,
  ) {
    const sock = resolved.proxy
      ? await createProxySocket({
          proxy: resolved.proxy,
          targetHost: resolved.hostName,
          targetPort: host.port ?? resolved.port,
        })
      : undefined;
    const client = new Client();
    return await new Promise<Client>((resolve, reject) => {
      let settled = false;
      const fail = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        this.deleteClientIfCurrent(key, token);
        sock?.destroy();
        client.end();
        reject(error);
      };
      client
        .on("ready", () => {
          if (this.clientTokens.get(key) !== token) {
            fail(new Error("SSH connection attempt was superseded by Host reconfiguration"));
            return;
          }
          settled = true;
          resolve(client);
        })
        .on("error", fail)
        .on("end", () => this.deleteClientIfCurrent(key, token))
        .on("close", () => {
          this.deleteClientIfCurrent(key, token);
          fail(new Error(SSH_CONNECTION_CLOSED_BEFORE_READY));
        })
        .connect({
          host: sock ? undefined : resolved.hostName,
          sock,
          username: host.username ?? resolved.username,
          port: sock ? undefined : (host.port ?? resolved.port),
          agent: host.authMode === "agent" ? process.env.SSH_AUTH_SOCK : undefined,
          password: host.authMode === "password" ? (host.password ?? undefined) : undefined,
          privateKey:
            host.privateKey !== null && host.privateKey !== undefined && host.privateKey !== ""
              ? Buffer.from(host.privateKey)
              : resolved.privateKeyPath !== null &&
                  resolved.privateKeyPath !== undefined &&
                  resolved.privateKeyPath !== ""
                ? readFileSync(expandHome(resolved.privateKeyPath))
                : undefined,
          readyTimeout: SSH_READY_TIMEOUT_MS,
          keepaliveInterval: SSH_KEEPALIVE_INTERVAL_MS,
          keepaliveCountMax: SSH_KEEPALIVE_COUNT_MAX,
        });
    });
  }

  private async notifyReady(connection: Promise<Client>, host: HostWithSecret) {
    const client = await connection;
    const userId = currentGatewayUserId();
    if (userId !== null) this.emit("ready", { userId, host });
    return client;
  }

  private deleteClientIfCurrent(key: string, token: symbol) {
    if (this.clientTokens.get(key) !== token) return;
    this.clientTokens.delete(key);
    this.clients.delete(key);
    this.sftpChannels.close(key);
  }
}

import type { HostCreateInput, HostRecord, HostUpdateInput } from "~~/shared/types";
import { trimmedOrNull } from "~~/shared/utils/strings";
import { gatewayMemoryState, nextId, nowIso, type StoredHostRecord } from "./memory";

function sanitizeHost(host: StoredHostRecord): HostRecord {
  const { privateKey: _privateKey, password: _password, ...publicHost } = host;
  return {
    ...publicHost,
    hasPrivateKey: Boolean(host.privateKey),
    hasPassword: Boolean(host.password),
  };
}

function normalizeHost(input: HostCreateInput, id = nextId(gatewayMemoryState.hosts)) {
  const timestamp = nowIso();
  const existing = gatewayMemoryState.hosts.find((host) => host.id === id);
  const privateKey =
    input.authMode === "privateKey"
      ? (input.privateKey ?? (existing?.authMode === "privateKey" ? existing.privateKey : null))
      : null;
  const password =
    input.authMode === "password"
      ? (input.password ?? (existing?.authMode === "password" ? existing.password : null))
      : null;
  return {
    id,
    name: input.name.trim(),
    sshHost: input.sshHost.trim(),
    username: trimmedOrNull(input.username),
    port: input.port ?? null,
    authMode: input.authMode,
    privateKeyPath: trimmedOrNull(input.privateKeyPath),
    privateKey,
    password,
    proxyUrl: trimmedOrNull(input.proxyUrl),
    hasPrivateKey: Boolean(privateKey),
    hasPassword: Boolean(password),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export const hostStore = {
  replaceHosts(hosts: HostRecord[]) {
    gatewayMemoryState.hosts = hosts.map((host) => ({
      ...host,
      proxyUrl: trimmedOrNull(host.proxyUrl),
      hasPrivateKey: Boolean(host.privateKey),
      hasPassword: Boolean(host.password),
    }));
  },

  list(): HostRecord[] {
    return gatewayMemoryState.hosts
      .map(sanitizeHost)
      .sort((left, right) => left.name.localeCompare(right.name));
  },

  listWithSecret(): StoredHostRecord[] {
    return [...gatewayMemoryState.hosts];
  },

  get(id: number): HostRecord | null {
    const host = gatewayMemoryState.hosts.find((item) => item.id === id);
    return host ? sanitizeHost(host) : null;
  },

  getWithSecret(id: number): StoredHostRecord | null {
    return gatewayMemoryState.hosts.find((item) => item.id === id) ?? null;
  },

  create(input: HostCreateInput): HostRecord {
    const host = normalizeHost(input);
    gatewayMemoryState.hosts.push(host);
    return sanitizeHost(host);
  },

  update(id: number, input: HostUpdateInput): HostRecord | null {
    const existing = gatewayMemoryState.hosts.find((host) => host.id === id);
    if (!existing) {
      return null;
    }
    const host = normalizeHost(input, id);
    gatewayMemoryState.hosts = gatewayMemoryState.hosts.map((item) =>
      item.id === id ? host : item,
    );
    return sanitizeHost(host);
  },

  delete(id: number) {
    gatewayMemoryState.hosts = gatewayMemoryState.hosts.filter((host) => host.id !== id);
  },

  hostIds() {
    return new Set(gatewayMemoryState.hosts.map((host) => host.id));
  },

  count() {
    return gatewayMemoryState.hosts.length;
  },
};

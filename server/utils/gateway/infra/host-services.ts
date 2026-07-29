import { CodexRuntimeService } from "./codex/codex-runtime";
import { RemoteFileService } from "./files/remote-files";
import { SshConnectionPool } from "./ssh/ssh-connection";
import { HostMetricsManager } from "../host-metrics/manager";

export const sshConnections = new SshConnectionPool();
export const remoteFiles = new RemoteFileService(sshConnections);
export const codexRuntime = new CodexRuntimeService(sshConnections);
export const hostMetricsManager = new HostMetricsManager(sshConnections);

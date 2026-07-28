import { CodexRuntimeService } from "./codex/codex-runtime";
import { RemoteFileService } from "./files/remote-files";
import { SshConnectionPool } from "./ssh/ssh-connection";

export const sshConnections = new SshConnectionPool();
export const remoteFiles = new RemoteFileService(sshConnections);
export const codexRuntime = new CodexRuntimeService(sshConnections);

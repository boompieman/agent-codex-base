// Channel pools only retry failures that invalidate the shared SSH transport itself.
export function isConnectionLevelSshError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /No response from server|Not connected|Connection lost|Channel open failure|ECONNRESET|EPIPE/i.test(
    message,
  );
}

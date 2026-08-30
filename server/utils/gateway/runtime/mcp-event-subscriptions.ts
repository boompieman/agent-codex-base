import { currentGatewayUserId } from "../state/memory";

const subscriptions = new Map<string, string>();

function key(hostId: number, subscriptionId: string) {
  return `${currentGatewayUserId()}:${hostId}:${subscriptionId}`;
}

export const mcpEventSubscriptions = {
  register(hostId: number, subscriptionId: string, threadId: string) {
    subscriptions.set(key(hostId, subscriptionId), threadId);
  },
  unregister(hostId: number, subscriptionId: string) {
    subscriptions.delete(key(hostId, subscriptionId));
  },
  threadId(hostId: number, subscriptionId: string) {
    return subscriptions.get(key(hostId, subscriptionId)) ?? null;
  },
  clearHost(hostId: number) {
    const prefix = `${currentGatewayUserId()}:${hostId}:`;
    for (const subscriptionKey of subscriptions.keys()) {
      if (subscriptionKey.startsWith(prefix)) subscriptions.delete(subscriptionKey);
    }
  },
};

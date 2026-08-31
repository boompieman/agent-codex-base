export type ReleaseSubscription = () => void;

export interface OwnedSubscription {
  ownerId: string;
  release: ReleaseSubscription;
}

export function replaceSubscription<Key>(
  subscriptions: Map<Key, ReleaseSubscription>,
  key: Key,
  subscribe: () => ReleaseSubscription,
) {
  subscriptions.get(key)?.();
  const release = subscribe();
  subscriptions.set(key, release);
  return release;
}

export function removeSubscription<Key>(subscriptions: Map<Key, ReleaseSubscription>, key: Key) {
  subscriptions.get(key)?.();
  subscriptions.delete(key);
}

export function clearSubscriptions<Key>(subscriptions: Map<Key, ReleaseSubscription>) {
  for (const release of subscriptions.values()) release();
  subscriptions.clear();
}

export function replaceOwnedSubscription<Key>(
  subscriptions: Map<Key, OwnedSubscription>,
  key: Key,
  ownerId: string,
  release: ReleaseSubscription,
) {
  subscriptions.get(key)?.release();
  const subscription = { ownerId, release };
  subscriptions.set(key, subscription);
  return subscription;
}

export function removeOwnedSubscription<Key>(
  subscriptions: Map<Key, OwnedSubscription>,
  key: Key,
  ownerId?: string,
) {
  const subscription = subscriptions.get(key);
  if (subscription === undefined || (ownerId !== undefined && subscription.ownerId !== ownerId)) {
    return;
  }
  subscription.release();
  subscriptions.delete(key);
}

export function clearOwnedSubscriptions<Key>(subscriptions: Map<Key, OwnedSubscription>) {
  for (const subscription of subscriptions.values()) subscription.release();
  subscriptions.clear();
}

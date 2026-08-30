import type { Ref } from "vue";

type Updater<T> = T | ((previous: T) => T);

export function valueUpdater<T>(updaterOrValue: Updater<T>, ref: Ref<T>) {
  ref.value = isUpdaterFunction(updaterOrValue) ? updaterOrValue(ref.value) : updaterOrValue;
}

function isUpdaterFunction<T>(value: Updater<T>): value is (previous: T) => T {
  return typeof value === "function";
}

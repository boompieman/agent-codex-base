import Decimal from "decimal.js";
import type { ThreadResponseUsage } from "~~/shared/thread-history/types";

export function totalResponseUsageAmount(entries: ThreadResponseUsage[] | undefined) {
  if (entries === undefined || entries.length === 0) return null;
  try {
    return entries
      .reduce((total, entry) => total.plus(new Decimal(entry.amount)), new Decimal(0))
      .toString();
  } catch {
    // `amount` is an opaque upstream decimal string. Preserve unexpected future formats rather
    // than coercing them to a lossy Number or hiding otherwise useful response metadata.
    return entries.map((entry) => entry.amount).join(" + ");
  }
}

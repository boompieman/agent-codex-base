export function formatBytes(value: number) {
  return formatBinaryUnit(value, "B");
}

export function formatByteRate(value: number | null) {
  return value === null ? "-" : `${formatBinaryUnit(value, "B")}/s`;
}

export function formatPercent(value: number | null) {
  return value === null ? "-" : `${value.toFixed(1)}%`;
}

function formatBinaryUnit(value: number, baseUnit: string) {
  const units = [baseUnit, `Ki${baseUnit}`, `Mi${baseUnit}`, `Gi${baseUnit}`, `Ti${baseUnit}`];
  let scaled = Math.max(0, value);
  let unitIndex = 0;
  while (scaled >= 1_024 && unitIndex < units.length - 1) {
    scaled /= 1_024;
    unitIndex += 1;
  }
  return `${scaled.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

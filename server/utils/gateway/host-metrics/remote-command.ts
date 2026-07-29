import { shellQuote } from "../infra/ssh/shell";

export function hostMetricsRemoteCommand() {
  return `sh -lc ${shellQuote(script())}`;
}

function script() {
  return String.raw`
set -u
if [ ! -r /proc/stat ] || [ ! -r /proc/meminfo ] || [ ! -r /proc/net/dev ] || [ ! -r /proc/diskstats ]; then
  printf '@@UNSUPPORTED\n'
  exit 0
fi
export LC_ALL=C
sampled_at="$(date +%s%3N 2>/dev/null || printf '%s000' "$(date +%s)")"
printf '@@BEGIN\t%s\n' "$sampled_at"
printf '@@CPU\n'
sed -n '1p' /proc/stat
printf '@@LOAD\n'
sed -n '1p' /proc/loadavg
printf '@@MEM\n'
grep -E '^(MemTotal|MemAvailable):' /proc/meminfo
printf '@@ROUTE\n'
cat /proc/net/route
printf '@@NET\n'
cat /proc/net/dev
printf '@@BLOCK\n'
for block in /sys/block/*; do [ -e "$block" ] && basename "$block"; done
printf '@@DISK\n'
cat /proc/diskstats
printf '@@FS\n'
df -PkT 2>/dev/null || true
printf '@@GPU\n'
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi --query-gpu=index,uuid,name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits 2>/dev/null || true
fi
printf '@@END\n'
`;
}

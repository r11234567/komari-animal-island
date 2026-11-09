// Billing traffic uses the same decimal GB as provider calibration. RAM, disks
// and transfer rates keep their existing binary formatting.
export function formatTrafficGB(bytes = 0): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0.00 GB';
  return `${(Math.max(0, bytes) / 1_000_000_000).toFixed(2)} GB`;
}

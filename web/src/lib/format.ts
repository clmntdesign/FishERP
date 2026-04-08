const krwFormatter = new Intl.NumberFormat("ko-KR");

export function formatKrw(value: number): string {
  return `₩${krwFormatter.format(value)}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

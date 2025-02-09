export function formatBSV(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8
  });
}

export function formatAddress(address: string | null): string {
  if (!address) return '';
  if (address.length < 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
} 
export const formatBSV = (sats: number | undefined | null): string => {
  if (sats === undefined || sats === null) return '0';
  const bsv = (sats / 100000000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8
  });
  return bsv;
};

export function formatAddress(address: string | null): string {
  if (!address) return '';
  if (address.length < 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
} 
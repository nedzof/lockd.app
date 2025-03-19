export const formatBSV = (sats: number | undefined | null): string => {
  if (sats === undefined || sats === null) return '0';
  
  const bsvValue = sats / 100000000;
  
  // For integer values, return as integers without decimals
  if (Number.isInteger(bsvValue)) {
    return bsvValue.toString();
  }
  
  // For small values (like in the stats cards), preserve just the necessary decimals
  if (bsvValue < 1) {
    // Remove trailing zeros but keep necessary precision
    return bsvValue.toString().replace(/\.?0+$/, '');
  }
  
  // For regular amounts, use the normal format with commas for thousands
  const bsv = bsvValue.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8
  }).replace(/\.?0+$/, ''); // Remove trailing zeros
  
  return bsv;
};

// For axis labels specifically, we want simple integers when possible
export const formatAxisValue = (value: number): string => {
  if (value === 0) return '0';
  
  // If it's a small decimal, display as a clean number without trailing zeros
  if (value < 0.01) {
    return value.toString().replace(/\.?0+$/, '');
  }
  
  // If it's an integer, return it as is
  if (Number.isInteger(value)) {
    return value.toString();
  }
  
  // Otherwise, limit to 2 decimal places and remove trailing zeros
  return value.toFixed(2).replace(/\.?0+$/, '');
};

export function formatAddress(address: string | null): string {
  if (!address) return '';
  if (address.length < 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
} 
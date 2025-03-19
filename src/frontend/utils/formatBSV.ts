/**
 * Format a satoshi amount into BSV with appropriate formatting
 * Note: 1 BSV = 100,000,000 satoshis
 */
export const formatBSV = (sats: number | undefined | null): string => {
  if (sats === undefined || sats === null) return '0';
  
  // Convert satoshis to BSV
  const bsvValue = sats / 100000000;
  
  // For very small values, show more precision
  if (bsvValue < 0.001) {
    // For extremely small values, use scientific notation
    if (bsvValue < 0.000001) {
      return bsvValue.toExponential(6);
    }
    // For small but displayable values, show appropriate precision
    return bsvValue.toFixed(6).replace(/\.?0+$/, '');
  }
  
  // For small values (like on y-axis), use a simpler format without trailing zeros
  if (bsvValue < 0.01) {
    return bsvValue.toFixed(4).replace(/\.?0+$/, '');
  }
  
  // For regular amounts, use the normal format with commas for thousands
  // Use fixed precision based on size to ensure readable numbers
  let formattedValue: string;
  if (bsvValue < 1) {
    formattedValue = bsvValue.toFixed(3);
  } else if (bsvValue < 10) {
    formattedValue = bsvValue.toFixed(2);
  } else {
    formattedValue = bsvValue.toFixed(2);
  }
  
  // Add thousands separators and remove trailing zeros
  return formattedValue.replace(/\B(?=(\d{3})+(?!\d))/g, ",").replace(/\.?0+$/, '');
};

// For axis labels specifically, we want simple integers when possible
export const formatAxisValue = (value: number): string => {
  if (value === 0) return '0';
  
  // If it's a small decimal, display as a clean number without trailing zeros
  if (value < 0.01) {
    return value.toFixed(6).replace(/\.?0+$/, '');
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
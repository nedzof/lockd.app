export const getProgressColor = (amount: number, threshold: number): string => {
  const percentage = (amount / threshold) * 100;
  
  if (percentage >= 100) return 'bg-[#00ffa3]';  // Full progress - green
  if (percentage >= 75) return 'bg-[#00ff7a]';   // High progress - light green
  if (percentage >= 50) return 'bg-[#ffaa00]';   // Medium progress - orange
  if (percentage >= 25) return 'bg-[#ff7a00]';   // Low progress - dark orange
  return 'bg-[#ff4a00]';                         // Very low progress - red
}; 
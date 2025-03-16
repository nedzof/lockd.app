export function getProgressColor(amount: number, threshold: number): string {
  const percentage = (amount / threshold) * 100;
  if (percentage >= 100) return 'bg-orange-500';
  if (percentage >= 75) return 'bg-green-500';
  if (percentage >= 50) return 'bg-blue-500';
  if (percentage >= 25) return 'bg-yellow-500';
  return 'bg-gray-500';
} 
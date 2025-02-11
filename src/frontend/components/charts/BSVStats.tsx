import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { formatBSV } from '../../utils/formatBSV';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const API_URL = 'http://localhost:3001';

interface BSVStatsProps {
  totalLocked: number;
  participantCount: number;
  roundNumber: number;
}

export const BSVStats: React.FC<BSVStatsProps> = ({
  totalLocked,
  participantCount,
  roundNumber
}) => {
  const [chartData, setChartData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`${API_URL}/api/stats`);
        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }
        const data = await response.json();
        
        // Process data for chart
        setChartData({
          labels: data.timestamps,
          datasets: [
            {
              label: 'Total BSV Locked',
              data: data.amounts,
              fill: true,
              borderColor: '#00ffa3',
              backgroundColor: 'rgba(0, 255, 163, 0.1)',
              tension: 0.4
            }
          ]
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
        setError(error instanceof Error ? error.message : 'Failed to load stats');
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (isLoading) {
    return <div className="text-gray-400">Loading stats...</div>;
  }

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  const options = {
    responsive: true,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            return `${formatBSV(context.raw)} BSV`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return formatBSV(value) + ' BSV';
          }
        }
      }
    }
  };

  return (
    <div className="bg-[#2A2A40]/20 backdrop-blur-sm rounded-lg p-6">
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-[#00ffa3]">
            {formatBSV(totalLocked)}
          </div>
          <div className="text-sm text-gray-400">Total BSV Locked</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[#00ffa3]">
            {participantCount}
          </div>
          <div className="text-sm text-gray-400">Participants</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[#00ffa3]">
            {roundNumber}
          </div>
          <div className="text-sm text-gray-400">Round</div>
        </div>
      </div>
      {chartData && <Line data={chartData} options={options} />}
    </div>
  );
};
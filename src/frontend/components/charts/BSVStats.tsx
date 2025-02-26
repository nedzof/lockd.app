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
  Filler,
  ArcElement,
  BarElement
} from 'chart.js';
import { Line, Pie, Bar } from 'react-chartjs-2';
import { formatBSV } from '../../utils/formatBSV';
import { FiClock, FiTrendingUp, FiUsers, FiRefreshCw } from 'react-icons/fi';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
  BarElement
);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface StatsData {
  totalLocked: number;
  uniqueUsers: number;
  totalTransactions: number;
  timeSeriesData: {
    timestamp: string;
    lockedAmount: number;
    uniqueLocks: number;
  }[];
  poolDistribution: {
    range: string;
    amount: number;
  }[];
  durationDistribution: {
    duration: string;
    count: number;
  }[];
  volumeOverTime: {
    timestamp: string;
    volume: number;
  }[];
}

const defaultStatsData: StatsData = {
  totalLocked: 0,
  uniqueUsers: 0,
  totalTransactions: 0,
  timeSeriesData: [],
  poolDistribution: [],
  durationDistribution: [],
  volumeOverTime: []
};

export const BSVStats: React.FC = () => {
  const [statsData, setStatsData] = useState<StatsData>(defaultStatsData);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/api/stats`);
      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }
      const data = await response.json();
      setStatsData({
        ...defaultStatsData,
        ...data
      });
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching stats:', error);
      setError(error instanceof Error ? error.message : 'Failed to load stats');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Fetch new data every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <FiRefreshCw className="w-8 h-8 text-[#00ffa3] animate-spin" />
          <p className="text-gray-400">Loading statistics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <p className="text-red-500">{error}</p>
          <button 
            onClick={fetchStats}
            className="px-4 py-2 text-[#00ffa3] border border-[#00ffa3] rounded-lg hover:bg-[#00ffa3] hover:text-black transition-all duration-300"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const timelineData = {
    labels: statsData.timeSeriesData.map(d => new Date(d.timestamp).toLocaleDateString()),
    datasets: [
      {
        label: 'Locked BSV',
        data: statsData.timeSeriesData.map(d => d.lockedAmount),
        borderColor: '#00ffa3',
        backgroundColor: 'rgba(0, 255, 163, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Unique Locks',
        data: statsData.timeSeriesData.map(d => d.uniqueLocks),
        borderColor: '#ff00ff',
        backgroundColor: 'rgba(255, 0, 255, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  const poolData = {
    labels: statsData.poolDistribution.map(d => d.range),
    datasets: [
      {
        data: statsData.poolDistribution.map(d => d.amount),
        backgroundColor: [
          '#00ffa3',
          '#ff00ff',
          '#00ffff',
          '#ffa500',
          '#ff0000'
        ]
      }
    ]
  };

  const durationData = {
    labels: statsData.durationDistribution.map(d => d.duration),
    datasets: [
      {
        label: 'Number of Locks',
        data: statsData.durationDistribution.map(d => d.count),
        backgroundColor: '#00ffff'
      }
    ]
  };

  const volumeData = {
    labels: statsData.volumeOverTime.map(d => new Date(d.timestamp).toLocaleDateString()),
    datasets: [
      {
        label: 'Volume (BSV)',
        data: statsData.volumeOverTime.map(d => d.volume),
        borderColor: '#ffa500',
        backgroundColor: 'rgba(255, 165, 0, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#fff'
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: {
          color: '#fff'
        }
      },
      y: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: {
          color: '#fff'
        }
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* Header with real-time indicator */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Network Statistics</h1>
        <div className="flex items-center space-x-2 text-sm text-gray-400">
          <div className="flex items-center">
            <div className="w-2 h-2 bg-[#00ffa3] rounded-full mr-2 animate-pulse" />
            <span>Live on-chain data</span>
          </div>
          {lastUpdated && (
            <span>· Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {/* Stats Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-[#2A2A40]/50 to-[#1A1B23]/50 rounded-lg p-6 border border-gray-800/10">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-[#00ffa3] bg-opacity-5 rounded-lg">
              <FiTrendingUp className="text-[#00ffa3] w-5 h-5" />
            </div>
            <h3 className="text-gray-400 text-sm">Total Locked</h3>
          </div>
          <p className="text-2xl font-bold text-white">{formatBSV(statsData.totalLocked)} BSV</p>
        </div>

        <div className="bg-gradient-to-br from-[#2A2A40]/50 to-[#1A1B23]/50 rounded-lg p-6 border border-gray-800/10">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-[#ff00ff] bg-opacity-5 rounded-lg">
              <FiUsers className="text-[#ff00ff] w-5 h-5" />
            </div>
            <h3 className="text-gray-400 text-sm">Unique Users</h3>
          </div>
          <p className="text-2xl font-bold text-white">{statsData.uniqueUsers}</p>
        </div>

        <div className="bg-gradient-to-br from-[#2A2A40]/50 to-[#1A1B23]/50 rounded-lg p-6 border border-gray-800/10">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-[#00ffff] bg-opacity-5 rounded-lg">
              <FiClock className="text-[#00ffff] w-5 h-5" />
            </div>
            <h3 className="text-gray-400 text-sm">Total Transactions</h3>
          </div>
          <p className="text-2xl font-bold text-white">{statsData.totalTransactions}</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Timeline Chart */}
        <div className="bg-gradient-to-br from-[#2A2A40]/50 to-[#1A1B23]/50 rounded-lg p-6 border border-gray-800/10">
          <h3 className="text-white font-medium mb-4">Lock Timeline</h3>
          <Line data={timelineData} options={chartOptions} />
        </div>

        {/* Pool Distribution Chart */}
        <div className="bg-gradient-to-br from-[#2A2A40]/50 to-[#1A1B23]/50 rounded-lg p-6 border border-gray-800/10">
          <h3 className="text-white font-medium mb-4">Pool Distribution</h3>
          <Pie
            data={poolData}
            options={{
              responsive: true,
              plugins: {
                legend: {
                  position: 'right' as const,
                  labels: {
                    color: '#fff'
                  }
                }
              }
            }}
          />
        </div>

        {/* Lock Duration Distribution */}
        <div className="bg-gradient-to-br from-[#2A2A40]/50 to-[#1A1B23]/50 rounded-lg p-6 border border-gray-800/10">
          <h3 className="text-white font-medium mb-4">Lock Duration Distribution</h3>
          <Bar
            data={durationData}
            options={{
              ...chartOptions,
              plugins: {
                ...chartOptions.plugins,
                legend: {
                  display: false
                }
              }
            }}
          />
        </div>

        {/* Transaction Volume Chart */}
        <div className="bg-gradient-to-br from-[#2A2A40]/50 to-[#1A1B23]/50 rounded-lg p-6 border border-gray-800/10">
          <h3 className="text-white font-medium mb-4">Transaction Volume</h3>
          <Line data={volumeData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
};
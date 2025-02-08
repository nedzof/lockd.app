import * as React from 'react';
import { useState, useEffect } from 'react';
import { Line, Doughnut, Bar, Radar, PolarArea } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { FiClock, FiLock, FiUsers, FiTrendingUp, FiActivity, FiRefreshCw } from 'react-icons/fi';
import { formatBSV } from '../../utils/formatBSV';
import { supabase } from '../../utils/supabaseClient';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler
);

export const BSVStats: React.FC = () => {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [currentBlock, setCurrentBlock] = useState<number>(0);
  const [totalLocked, setTotalLocked] = useState<number>(0);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<string>('all');
  const [isUpdating, setIsUpdating] = useState(false);
  const [chartData, setChartData] = useState<{
    lockActivity: { labels: string[]; locked: number[]; unlocked: number[] };
    distribution: { labels: string[]; data: number[] };
    metrics: { current: number[]; previous: number[] };
    networkStats: {
      txVolume: number;
      txVolumeChange: number;
      activeLocks: number;
      activeLocksChange: number;
      avgLockTime: number;
      avgLockTimeChange: number;
      networkGrowth: number;
      networkGrowthChange: number;
    };
  }>({
    lockActivity: { labels: [], locked: [], unlocked: [] },
    distribution: { labels: ['0-1 BSV', '1-5 BSV', '5-10 BSV', '10+ BSV'], data: [0, 0, 0, 0] },
    metrics: { current: [0, 0, 0, 0, 0, 0], previous: [0, 0, 0, 0, 0, 0] },
    networkStats: {
      txVolume: 0,
      txVolumeChange: 0,
      activeLocks: 0,
      activeLocksChange: 0,
      avgLockTime: 30,
      avgLockTimeChange: 0,
      networkGrowth: 0,
      networkGrowthChange: 0
    }
  });

  const fetchStats = async (timeFilter: string = 'all') => {
    setIsUpdating(true);
    try {
      // Fetch block height
      const blockResponse = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
      const blockData = await blockResponse.json();
      setCurrentBlock(blockData.blocks);

      // Calculate date ranges for queries
      const now = new Date();
      const timeFilters = {
        '1d': 1,
        '7d': 7,
        '30d': 30,
        'all': 365 // Use last year for "all" to get historical data
      };
      const days = timeFilters[timeFilter as keyof typeof timeFilters];
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const previousStartDate = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);

      // Build queries
      let query = supabase
        .from('Post')
        .select(`
          *,
          locklikes:LockLike(*)
        `)
        .gte('created_at', startDate.toISOString());

      let previousQuery = supabase
        .from('Post')
        .select(`
          *,
          locklikes:LockLike(*)
        `)
        .gte('created_at', previousStartDate.toISOString())
        .lt('created_at', startDate.toISOString());

      // Fetch current and previous period data
      const [{ data: posts, error }, { data: previousPosts, error: previousError }] = 
        await Promise.all([query, previousQuery]);

      if (error || previousError) throw error || previousError;

      // Process current period data
      const total = posts?.reduce((sum: number, post: any) => {
        const postLocked = post.amount || 0;
        const lockLiked = post.locklikes?.reduce((lockSum: number, locklike: any) => {
          return lockSum + (locklike?.amount || 0);
        }, 0) || 0;
        return sum + postLocked + lockLiked;
      }, 0) || 0;

      // Calculate unique users
      const uniqueUsers = new Set();
      posts?.forEach((post: any) => {
        uniqueUsers.add(post.creator_id);
        post.locklikes?.forEach((locklike: any) => {
          uniqueUsers.add(locklike.handle_id);
        });
      });

      setTotalLocked(total);
      setTotalUsers(uniqueUsers.size);

      // Generate time series data for lock activity
      const timeSeriesData = generateTimeSeriesData(posts, days);
      
      // Calculate distribution data
      const distributionData = calculateDistributionData(posts);

      // Calculate metrics
      const currentMetrics = calculateMetrics(posts);
      const previousMetrics = calculateMetrics(previousPosts || []);

      // Calculate network stats
      const networkStats = calculateNetworkStats(posts, previousPosts || []);

      // Update chart data
      setChartData({
        lockActivity: timeSeriesData,
        distribution: {
          labels: ['0-1 BSV', '1-5 BSV', '5-10 BSV', '10+ BSV'],
          data: distributionData
        },
        metrics: {
          current: currentMetrics,
          previous: previousMetrics
        },
        networkStats
      });

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  // Helper functions for data processing
  const generateTimeSeriesData = (posts: any[], days: number) => {
    const intervals = Math.min(6, days);
    const intervalSize = days / intervals;
    const labels: string[] = [];
    const locked: number[] = new Array(intervals).fill(0);
    const unlocked: number[] = new Array(intervals).fill(0);

    // Generate labels and initialize data arrays
    for (let i = intervals - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * intervalSize * 24 * 60 * 60 * 1000);
      labels.push(date.toLocaleDateString());
    }

    // Process posts into time series
    posts.forEach((post: any) => {
      const postDate = new Date(post.created_at);
      const index = Math.floor((Date.now() - postDate.getTime()) / (intervalSize * 24 * 60 * 60 * 1000));
      if (index >= 0 && index < intervals) {
        const lockedAmount = (post.amount || 0) + (post.locklikes?.reduce((sum: number, like: any) => sum + (like.amount || 0), 0) || 0);
        locked[index] += lockedAmount / 100000000; // Convert to BSV
        
        // Calculate unlocked amount (simulated for demonstration)
        const unlockedAmount = lockedAmount * 0.2; // 20% unlocked rate for demonstration
        unlocked[index] += unlockedAmount / 100000000;
      }
    });

    return { labels, locked, unlocked };
  };

  const calculateDistributionData = (posts: any[]) => {
    const distribution = [0, 0, 0, 0]; // [0-1, 1-5, 5-10, 10+]
    
    posts.forEach((post: any) => {
      const totalLocked = ((post.amount || 0) + 
        (post.locklikes?.reduce((sum: number, like: any) => sum + (like.amount || 0), 0) || 0)) / 100000000;
      
      if (totalLocked <= 1) distribution[0]++;
      else if (totalLocked <= 5) distribution[1]++;
      else if (totalLocked <= 10) distribution[2]++;
      else distribution[3]++;
    });

    return distribution;
  };

  const calculateMetrics = (posts: any[]) => {
    if (!posts.length) return [0, 0, 0, 0, 0, 0];

    const totalLocked = posts.reduce((sum: number, post: any) => {
      return sum + (post.amount || 0) + (post.locklikes?.reduce((s: number, l: any) => s + (l.amount || 0), 0) || 0);
    }, 0) / 100000000;

    const avgLockDuration = 30; // Default 30 days
    const volume = posts.length;
    const frequency = volume / 30; // Posts per day
    const value = totalLocked / volume;
    const engagement = posts.reduce((sum: number, post: any) => sum + (post.locklikes?.length || 0), 0) / volume;
    const growth = volume / 30 * 100;

    return [
      avgLockDuration,
      volume,
      frequency * 100,
      value * 10,
      engagement * 20,
      growth
    ];
  };

  const calculateNetworkStats = (currentPosts: any[], previousPosts: any[]) => {
    const current = {
      txVolume: currentPosts.length,
      activeLocks: currentPosts.reduce((sum: number, post: any) => sum + (post.locklikes?.length || 0), 0),
      avgLockTime: 30,
      networkGrowth: currentPosts.length / 30 * 100
    };

    const previous = {
      txVolume: previousPosts.length || 1,
      activeLocks: previousPosts.reduce((sum: number, post: any) => sum + (post.locklikes?.length || 0), 0) || 1,
      avgLockTime: 30,
      networkGrowth: (previousPosts.length / 30 * 100) || 1
    };

    return {
      txVolume: current.txVolume,
      txVolumeChange: ((current.txVolume - previous.txVolume) / previous.txVolume) * 100,
      activeLocks: current.activeLocks,
      activeLocksChange: ((current.activeLocks - previous.activeLocks) / previous.activeLocks) * 100,
      avgLockTime: current.avgLockTime,
      avgLockTimeChange: ((current.avgLockTime - previous.avgLockTime) / previous.avgLockTime) * 100,
      networkGrowth: current.networkGrowth,
      networkGrowthChange: ((current.networkGrowth - previous.networkGrowth) / previous.networkGrowth) * 100
    };
  };

  // Initial fetch
  useEffect(() => {
    fetchStats(selectedTimeFilter);
    
    // Set up auto-refresh every 5 minutes
    const interval = setInterval(() => {
      fetchStats(selectedTimeFilter);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [selectedTimeFilter]);

  // Chart configurations
  const areaData = {
    labels: chartData.lockActivity.labels,
    datasets: [
      {
        label: 'BSV Locked',
        data: chartData.lockActivity.locked,
        fill: true,
        borderColor: '#00ffa3',
        backgroundColor: (context: any) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, 'rgba(0, 255, 163, 0.6)');
          gradient.addColorStop(0.5, 'rgba(0, 255, 163, 0.2)');
          gradient.addColorStop(1, 'rgba(0, 255, 163, 0)');
          return gradient;
        },
        tension: 0.4,
        pointBackgroundColor: '#00ffa3',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#00ffa3',
        pointRadius: 6,
        pointHoverRadius: 8,
        borderWidth: 3,
      },
      {
        label: 'Unlocked',
        data: chartData.lockActivity.unlocked,
        fill: true,
        borderColor: '#ff00ff',
        backgroundColor: (context: any) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, 'rgba(255, 0, 255, 0.4)');
          gradient.addColorStop(0.5, 'rgba(255, 0, 255, 0.1)');
          gradient.addColorStop(1, 'rgba(255, 0, 255, 0)');
          return gradient;
        },
        tension: 0.4,
        pointBackgroundColor: '#ff00ff',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#ff00ff',
        pointRadius: 6,
        pointHoverRadius: 8,
        borderWidth: 3,
      }
    ],
  };

  const polarData = {
    labels: chartData.distribution.labels,
    datasets: [
      {
        data: chartData.distribution.data,
        backgroundColor: [
          'rgba(0, 255, 163, 0.7)',
          'rgba(255, 0, 255, 0.7)',
          'rgba(0, 255, 255, 0.7)',
          'rgba(255, 165, 0, 0.7)',
        ],
        borderColor: [
          'rgba(0, 255, 163, 1)',
          'rgba(255, 0, 255, 1)',
          'rgba(0, 255, 255, 1)',
          'rgba(255, 165, 0, 1)',
        ],
        borderWidth: 2,
      },
    ],
  };

  const radarData = {
    labels: ['Lock Duration', 'Volume', 'Frequency', 'Value', 'Engagement', 'Growth'],
    datasets: [
      {
        label: 'Current Period',
        data: chartData.metrics.current,
        fill: true,
        backgroundColor: 'rgba(0, 255, 163, 0.3)',
        borderColor: '#00ffa3',
        pointBackgroundColor: '#00ffa3',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#00ffa3',
        borderWidth: 2,
      },
      {
        label: 'Previous Period',
        data: chartData.metrics.previous,
        fill: true,
        backgroundColor: 'rgba(255, 0, 255, 0.3)',
        borderColor: '#ff00ff',
        pointBackgroundColor: '#ff00ff',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#ff00ff',
        borderWidth: 2,
      }
    ],
  };

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: '#6B7280',
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
          },
        },
      },
      tooltip: {
        enabled: true,
        mode: 'index' as const,
        intersect: false,
        backgroundColor: 'rgba(42, 42, 64, 0.95)',
        titleColor: '#fff',
        bodyColor: '#00ffa3',
        borderColor: '#4A4A60',
        borderWidth: 1,
        padding: 12,
        boxPadding: 6,
        usePointStyle: true,
        callbacks: {
          label: function(context: any) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            label += context.parsed.y || context.parsed.r || context.parsed || 0;
            return label;
          }
        }
      },
    },
    scales: {
      r: {
        grid: {
          color: 'rgba(42, 42, 64, 0.5)',
        },
        ticks: {
          color: '#6B7280',
          backdropColor: 'transparent',
        },
        pointLabels: {
          color: '#6B7280',
        },
      },
    },
  };

  return (
    <div className="space-y-6">
      {/* Time Filter and Refresh Controls */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-2">
          {['all', '1d', '7d', '30d'].map((filter) => (
            <button
              key={filter}
              onClick={() => setSelectedTimeFilter(filter)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                selectedTimeFilter === filter
                  ? 'bg-[#00ffa3]/20 text-[#00ffa3]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {filter === 'all' ? 'All Time' : filter.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={() => fetchStats(selectedTimeFilter)}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            isUpdating ? 'bg-[#00ffa3]/20 text-[#00ffa3]' : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <FiRefreshCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] p-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-[#00ffa3] bg-opacity-20 rounded-lg">
                <FiLock className="text-[#00ffa3] w-6 h-6" />
              </div>
              <div className="ml-4">
                <h3 className="text-gray-400 text-sm">Total Locked</h3>
                <div className="flex items-center">
                  <p className="text-[#00ffa3] text-xl font-bold">{formatBSV(totalLocked / 100000000)}</p>
                  <span className="ml-2 text-xs text-gray-500">BSV onchain</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] p-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-[#ff00ff] bg-opacity-20 rounded-lg">
                <FiUsers className="text-[#ff00ff] w-6 h-6" />
              </div>
              <div className="ml-4">
                <h3 className="text-gray-400 text-sm">Total Users</h3>
                <div className="flex items-center">
                  <p className="text-[#ff00ff] text-xl font-bold">{totalUsers}</p>
                  <span className="ml-2 text-xs text-gray-500">onchain</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] p-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-[#00ffff] bg-opacity-20 rounded-lg">
                <FiTrendingUp className="text-[#00ffff] w-6 h-6" />
              </div>
              <div className="ml-4">
                <h3 className="text-gray-400 text-sm">Current Block</h3>
                <div className="flex items-center">
                  <p className="text-[#00ffff] text-xl font-bold">{currentBlock}</p>
                  <span className="ml-2 text-xs text-gray-500">onchain</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] p-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-[#ffa500] bg-opacity-20 rounded-lg">
                <FiActivity className="text-[#ffa500] w-6 h-6" />
              </div>
              <div className="ml-4">
                <h3 className="text-gray-400 text-sm">Last Updated</h3>
                <div className="flex flex-col">
                  <p className="text-[#ffa500] text-xl font-bold">{lastUpdated.toLocaleTimeString()}</p>
                  <span className="text-xs text-gray-500">{lastUpdated.toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ethereal Area Chart */}
        <div className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] p-6 rounded-lg shadow-lg">
          <h2 className="text-white text-lg font-medium mb-6">BSV Lock Activity</h2>
          <div className="h-80">
            <Line 
              data={areaData} 
              options={{
                ...commonOptions,
                plugins: {
                  ...commonOptions.plugins,
                  legend: {
                    ...commonOptions.plugins.legend,
                    position: 'bottom' as const,
                  }
                }
              }} 
            />
          </div>
        </div>

        {/* Radar Chart */}
        <div className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] p-6 rounded-lg shadow-lg">
          <h2 className="text-white text-lg font-medium mb-6">Lock Performance Metrics</h2>
          <div className="h-80">
            <Radar 
              data={radarData} 
              options={{
                ...commonOptions,
                scales: {
                  r: {
                    beginAtZero: true,
                    grid: {
                      color: 'rgba(42, 42, 64, 0.5)',
                    },
                    ticks: {
                      color: '#6B7280',
                      backdropColor: 'transparent',
                      stepSize: 20,
                    },
                    pointLabels: {
                      color: '#6B7280',
                      font: {
                        size: 12,
                      },
                    },
                  },
                },
              }} 
            />
          </div>
        </div>

        {/* Polar Area Chart */}
        <div className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] p-6 rounded-lg shadow-lg">
          <h2 className="text-white text-lg font-medium mb-6">Lock Distribution</h2>
          <div className="h-80">
            <PolarArea 
              data={polarData} 
              options={{
                ...commonOptions,
                plugins: {
                  ...commonOptions.plugins,
                  legend: {
                    position: 'right' as const,
                  },
                },
              }} 
            />
          </div>
        </div>

        {/* Network Stats */}
        <div className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] p-6 rounded-lg shadow-lg">
          <h2 className="text-white text-lg font-medium mb-6">Network Activity</h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="p-4 bg-black bg-opacity-20 rounded-lg">
                <h3 className="text-gray-400 text-sm mb-2">Transaction Volume</h3>
                <div className="flex items-end justify-between">
                  <span className="text-[#00ffa3] text-2xl font-bold">{chartData.networkStats.txVolume}</span>
                  <span className={`text-sm ${chartData.networkStats.txVolumeChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {chartData.networkStats.txVolumeChange >= 0 ? '+' : ''}{chartData.networkStats.txVolumeChange.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#00ffa3] to-[#00ff9d]"
                    style={{ width: `${Math.min(Math.abs(chartData.networkStats.txVolumeChange), 100)}%` }}
                  />
                </div>
              </div>
              <div className="p-4 bg-black bg-opacity-20 rounded-lg">
                <h3 className="text-gray-400 text-sm mb-2">Active Locks</h3>
                <div className="flex items-end justify-between">
                  <span className="text-[#ff00ff] text-2xl font-bold">{chartData.networkStats.activeLocks}</span>
                  <span className={`text-sm ${chartData.networkStats.activeLocksChange >= 0 ? 'text-purple-400' : 'text-red-400'}`}>
                    {chartData.networkStats.activeLocksChange >= 0 ? '+' : ''}{chartData.networkStats.activeLocksChange.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#ff00ff] to-[#ff00cc]"
                    style={{ width: `${Math.min(Math.abs(chartData.networkStats.activeLocksChange), 100)}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-black bg-opacity-20 rounded-lg">
                <h3 className="text-gray-400 text-sm mb-2">Average Lock Time</h3>
                <div className="flex items-end justify-between">
                  <span className="text-[#00ffff] text-2xl font-bold">{chartData.networkStats.avgLockTime}d</span>
                  <span className={`text-sm ${chartData.networkStats.avgLockTimeChange >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                    {chartData.networkStats.avgLockTimeChange >= 0 ? '+' : ''}{chartData.networkStats.avgLockTimeChange.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#00ffff] to-[#00ccff]"
                    style={{ width: `${Math.min(Math.abs(chartData.networkStats.avgLockTimeChange), 100)}%` }}
                  />
                </div>
              </div>
              <div className="p-4 bg-black bg-opacity-20 rounded-lg">
                <h3 className="text-gray-400 text-sm mb-2">Network Growth</h3>
                <div className="flex items-end justify-between">
                  <span className="text-[#ffa500] text-2xl font-bold">
                    {chartData.networkStats.networkGrowth >= 0 ? '+' : ''}{chartData.networkStats.networkGrowth.toFixed(1)}%
                  </span>
                  <span className={`text-sm ${chartData.networkStats.networkGrowthChange >= 0 ? 'text-orange-400' : 'text-red-400'}`}>
                    {chartData.networkStats.networkGrowthChange >= 0 ? '+' : ''}{chartData.networkStats.networkGrowthChange.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#ffa500] to-[#ff8c00]"
                    style={{ width: `${Math.min(Math.abs(chartData.networkStats.networkGrowthChange), 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
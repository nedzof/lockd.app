import { API_URL } from "../config";
import React, { useState, useEffect } from 'react';
import { FiBarChart2, FiLock, FiTrendingUp, FiClock, FiDollarSign, FiUsers, FiPieChart } from 'react-icons/fi';
import { formatBSV } from '../utils/formatBSV';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush
} from 'recharts';
import { toast } from 'react-hot-toast';

interface StatsData {
  total_posts: number;
  total_votes: number;
  total_lock_likes: number;
  total_users: number;
  total_bsv_locked: number;
  avg_lock_duration: number;
  most_used_tag: string | null;
  most_active_user: string | null;
  current_bsv_price: number | null;
  last_updated: string;
  lockTimeData: Array<{ name: string; locks: number; active_locks: number }>;
  bsvLockedOverTime: Array<{ name: string; bsv: number; total_bsv: number }>;
  priceData: Array<{ name: string; price: number }>;
  lockSizeDistribution: {
    distribution: Array<{ name: string; count: number }>;
    totalLockedAmount: number;
  };
}

// Chart colors - using the app's color scheme
const CHART_COLORS = {
  locks: "#00E6CC",
  bsv: "#FF69B4",
  price: "#FFCA28"
};

const Stats: React.FC = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState('week');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetchStats();
    
    // Set up periodic refresh (every 5 minutes)
    const intervalId = setInterval(() => {
      fetchStats();
    }, 5 * 60 * 1000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [timeFilter]); // Re-fetch when time filter changes

  // Function to fetch stats from API
  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_URL}/api/stats?timeRange=${timeFilter}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setStats(data);
      
      // Set last updated time
      setLastUpdated(new Date());
      
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError('Failed to fetch statistics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Clean up these functions to use timeFilter instead of timeRange
  const combineDatasets = (data: any) => {
    if (!data) return [];
    return [];
  };

  // Replace addSampleData with a simpler function
  const getChartData = () => {
    return stats?.bsvLockedOverTime || [];
  };

  // Format large numbers with K/M suffix
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  // Calculate platform activity distribution
  const getPlatformActivityData = () => {
    if (!stats) return [];
    
    return [
      { name: 'Posts', value: stats.total_posts },
      { name: 'Votes', value: stats.total_votes },
      { name: 'Locks', value: stats.total_lock_likes },
    ];
  };

  // Generate lock size distribution data from API
  const getLockSizeDistributionData = () => {
    if (!stats || !stats.lockSizeDistribution || !stats.lockSizeDistribution.distribution) {
      // Fallback to sample data if API data is not available
      return [
        { name: "0-1", value: 0 },
        { name: "1-10", value: 0 },
        { name: "10-100", value: 0 },
        { name: "100-1000", value: 0 },
        { name: "1000+", value: 0 }
      ];
    }
    
    // Transform the distribution data to match the expected format for the chart
    return stats.lockSizeDistribution.distribution.map(item => ({
      name: item.name,
      value: item.count
    }));
  };

  // Function to manually trigger a stats update
  const triggerStatsUpdate = async () => {
    try {
      setIsUpdating(true);
      setError(null);
      
      const response = await fetch(`${API_URL}/api/stats/refresh`, {
        method: 'GET',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update stats: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Refresh stats after update
      fetchStats();
      
      toast.success('Statistics updated successfully');
    } catch (err) {
      console.error('Error updating stats:', err);
      setError('Failed to update statistics. Please try again.');
      toast.error('Failed to update statistics');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-6">
        <div className="space-y-8">
          {/* Header with real-time indicator */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">Platform Analytics</h1>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-400">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-[#00ffa3] rounded-full mr-2 animate-pulse" />
                  <span>100% Onchain Data Secured by Bitcoin SV</span>
                </div>
                {lastUpdated && (
                  <span>· Updated {lastUpdated.toLocaleTimeString()}</span>
                )}
              </div>
              
              {/* Add refresh button */}
              <button
                onClick={triggerStatsUpdate}
                disabled={isUpdating}
                className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center space-x-1
                  ${isUpdating 
                    ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
                    : 'bg-[#00ffa3]/10 text-[#00ffa3] hover:bg-[#00ffa3]/20'
                  }`}
              >
                <svg 
                  className={`h-4 w-4 ${isUpdating ? 'animate-spin' : ''}`}
                  xmlns="http://www.w3.org/2000/svg" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                  />
                </svg>
                <span>{isUpdating ? 'Updating...' : 'Refresh Stats'}</span>
              </button>
            </div>
          </div>

          {/* Time filter tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            {['24h', 'Week', 'Month', 'All Time'].map(filter => (
              <button
                key={filter}
                onClick={() => setTimeFilter(filter.toLowerCase())}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  timeFilter === filter.toLowerCase() 
                    ? 'bg-gray-100 text-gray-900' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/30 text-white p-4 rounded-lg mb-6">
              <p className="font-bold">Error:</p>
              <p>{error}</p>
              <button 
                onClick={fetchStats}
                className="mt-2 px-4 py-2 bg-red-500/30 hover:bg-red-500/40 rounded-md"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Loading state */}
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#00ffa3] mb-4"></div>
              <p className="text-lg text-gray-300">Loading statistics...</p>
            </div>
          ) : (
            <>
              {/* Stats content */}
              {/* Key metrics cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {/* Lock Count */}
                <div className="border border-gray-700 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-medium opacity-80">Onchain Locks</h3>
                    <FiLock className="h-5 w-5 text-[#00E6CC]" />
                  </div>
                  <p className="text-2xl font-bold">{stats?.total_lock_likes || 0}</p>
                  <p className="text-[#00E6CC] text-xs mt-1">Secured on BSV blockchain</p>
                </div>
                
                {/* BSV Locked */}
                <div className="border border-gray-700 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-medium opacity-80">BSV Locked</h3>
                    <FiTrendingUp className="h-5 w-5 text-[#00E6CC]" />
                  </div>
                  <p className="text-2xl font-bold">{formatBSV(stats?.total_bsv_locked || 0)}</p>
                  <p className="text-[#00E6CC] text-xs mt-1">Total value locked</p>
                </div>
                
                {/* BSV Price */}
                <div className="border border-gray-700 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-medium opacity-80">BSV Price</h3>
                    <FiDollarSign className="h-5 w-5 text-[#00E6CC]" />
                  </div>
                  <p className="text-2xl font-bold">
                    ${stats?.current_bsv_price ? stats.current_bsv_price.toFixed(2) : 'N/A'}
                  </p>
                  <p className="text-[#00E6CC] text-xs mt-1">Current market price</p>
                </div>
                
                {/* User Count */}
                <div className="border border-gray-700 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-medium opacity-80">Active Users</h3>
                    <FiUsers className="h-5 w-5 text-[#00E6CC]" />
                  </div>
                  <p className="text-2xl font-bold">{stats?.total_users || 0}</p>
                  <p className="text-[#00E6CC] text-xs mt-1">Unique participants</p>
                </div>
              </div>

              {/* Three-column charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
                {/* Lock Activity Trend */}
                <div className="border border-gray-700 rounded-lg p-5">
                  <h3 className="text-xl font-bold mb-1">Lock Activity Trend</h3>
                  <p className="text-sm opacity-70 mb-4">Number of new locks over time</p>
                  
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={getChartData()}
                        margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#444" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fill: '#ccc' }} reversed={true} />
                        <YAxis tick={{ fill: '#ccc' }} />
                        <Tooltip
                          contentStyle={{ 
                            backgroundColor: 'rgba(20, 20, 20, 0.95)', 
                            border: '1px solid #444',
                            borderRadius: '4px',
                          }}
                          formatter={(value) => [`${value}`, 'Locks']}
                        />
                        <Bar 
                          dataKey="locks" 
                          fill={CHART_COLORS.locks} 
                          radius={[2, 2, 0, 0]}
                          isAnimationActive={true}
                          animationDuration={1200}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* BSV Value Locked by Time */}
                <div className="border border-gray-700 rounded-lg p-5">
                  <h3 className="text-xl font-bold mb-1">Value Locked Trend</h3>
                  <p className="text-sm opacity-70 mb-4">BSV locked over time periods</p>
                  
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={getChartData()}
                        margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                      >
                        <defs>
                          <linearGradient id="bsvGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={CHART_COLORS.bsv} stopOpacity={0.6}/>
                            <stop offset="95%" stopColor={CHART_COLORS.bsv} stopOpacity={0.1}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#444" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fill: '#ccc' }} reversed={true} />
                        <YAxis tick={{ fill: '#ccc' }} tickFormatter={(value) => formatBSV(value)} />
                        <Tooltip
                          contentStyle={{ 
                            backgroundColor: 'rgba(20, 20, 20, 0.95)', 
                            border: '1px solid #444',
                            borderRadius: '4px'
                          }}
                          formatter={(value) => [formatBSV(Number(value)), 'BSV Locked']}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="bsv" 
                          stroke={CHART_COLORS.bsv} 
                          fillOpacity={1} 
                          fill="url(#bsvGradient)"
                          isAnimationActive={true}
                          animationDuration={1200}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Platform Activity */}
                <div className="border border-gray-700 rounded-lg p-5">
                  <h3 className="text-xl font-bold mb-1">Platform Activity</h3>
                  <p className="text-sm opacity-70 mb-4">Distribution of interactions</p>
                  
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={getPlatformActivityData()}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="value"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {getPlatformActivityData().map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={index === 0 ? '#8884d8' : index === 1 ? '#82ca9d' : CHART_COLORS.locks} 
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ 
                            backgroundColor: 'rgba(20, 20, 20, 0.95)', 
                            border: '1px solid #444',
                            borderRadius: '4px'
                          }}
                          formatter={(value, name) => [value, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Lock Sizes Distribution */}
              <div className="border border-gray-700 rounded-lg p-5 mb-8">
                <div className="flex items-center mb-1">
                  <FiPieChart className="h-5 w-5 text-[#00E6CC] mr-2" />
                  <h3 className="text-xl font-bold">Lock Size Distribution</h3>
                </div>
                <p className="text-sm opacity-70 mb-4">Breakdown of locks by BSV amount</p>
                
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={getLockSizeDistributionData()}
                      margin={{ top: 10, right: 30, left: 20, bottom: 20 }}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#444" opacity={0.3} />
                      <XAxis type="number" tick={{ fill: '#ccc' }} />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        tick={{ fill: '#ccc' }} 
                        width={100}
                      />
                      <Tooltip
                        contentStyle={{ 
                          backgroundColor: 'rgba(20, 20, 20, 0.95)', 
                          border: '1px solid #444',
                          borderRadius: '4px'
                        }}
                        formatter={(value, name, props) => [value, 'Locks']}
                      />
                      <Bar 
                        dataKey="value" 
                        fill={CHART_COLORS.bsv}
                        radius={[0, 2, 2, 0]} 
                        isAnimationActive={true}
                        animationDuration={1200}
                      >
                        {getLockSizeDistributionData().map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`}
                            fill={`rgba(255, 105, 180, ${0.5 + index * 0.1})`}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="text-sm opacity-70 text-center mt-2">
                  Total BSV locked: {formatBSV(stats?.lockSizeDistribution?.totalLockedAmount || stats?.total_bsv_locked || 0)}
                </div>
              </div>

              {/* Lock Duration & User Info */}
              <div className="border border-gray-700 rounded-lg p-5 mb-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                  <div className="mb-6 md:mb-0">
                    <h3 className="text-xl font-bold mb-3">Average Lock Duration</h3>
                    <div className="flex items-center">
                      <FiClock className="h-6 w-6 text-[#00E6CC] mr-2" />
                      <span className="text-3xl font-bold">
                        {Math.round(stats?.avg_lock_duration || 0).toLocaleString()} blocks
                      </span>
                    </div>
                    <p className="text-sm opacity-70 mt-2">Average time before locks can be unlocked</p>
                  </div>
                  
                  <div className="md:ml-8">
                    <h3 className="text-xl font-bold mb-3">Most Active User</h3>
                    <div className="bg-gray-800/50 rounded-md p-2 inline-block">
                      <span className="text-[#00E6CC] font-mono">
                        {stats?.most_active_user ? `${stats.most_active_user.substring(0, 6)}...${stats.most_active_user.substring(stats.most_active_user.length - 4)}` : 'N/A'}
                      </span>
                    </div>
                    <p className="text-sm opacity-70 mt-2">User with the most locked content</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center my-8">
                <div className="text-sm opacity-70 flex items-center">
                  <FiLock className="mr-2 text-[#00E6CC]" /> 
                  <span>All data secured onchain • Last updated: {stats ? new Date(stats.last_updated).toLocaleString() : 'N/A'}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Stats;

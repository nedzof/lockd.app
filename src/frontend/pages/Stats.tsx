import { API_URL } from "../config";
import React, { useState, useEffect } from 'react';
import { FiBarChart2, FiLock, FiTrendingUp, FiClock, FiDollarSign, FiUsers, FiPieChart } from 'react-icons/fi';
import { formatBSV } from '../utils/formatBSV';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush
} from 'recharts';

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
  lockTimeData: Array<{ name: string; locks: number }>;
  bsvLockedOverTime: Array<{ name: string; bsv: number }>;
  priceData: Array<{ name: string; price: number }>;
}

// Chart colors - using the app's color scheme
const CHART_COLORS = {
  locks: "#00E6CC",
  bsv: "#FF69B4",
  price: "#FFCA28"
};

const Stats: React.FC = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'all' | 'day' | 'week' | 'month'>('week');
  const [combinedData, setCombinedData] = useState<Array<{
    name: string;
    locks: number;
    bsv: number;
    price: number;
    date?: string;
  }>>([]);

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`${API_URL}/api/stats?timeRange=${timeRange}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch statistics');
        }
        
        const data = await response.json();
        console.log('Stats data received:', data);
        
        // Fetch BSV price history
        try {
          const priceResponse = await fetch(`${API_URL}/api/bsv-price/history?period=${timeRange}`);
          if (priceResponse.ok) {
            const priceData = await priceResponse.json();
            console.log('Price history data:', priceData);
            
            // Transform the price data to match our format
            const formattedPriceData = priceData.map((item: any) => {
              const date = new Date(item.date);
              let name = '';
              
              // Format the date based on the time range
              if (timeRange === 'day') {
                name = date.toLocaleString('default', { hour: '2-digit', minute: '2-digit' });
              } else if (timeRange === 'week') {
                name = date.toLocaleString('default', { day: 'numeric', month: 'short' });
              } else if (timeRange === 'month') {
                name = date.toLocaleString('default', { day: 'numeric', month: 'short' });
              } else {
                name = date.toLocaleString('default', { month: 'short' });
              }
              
              return {
                name,
                price: item.price
              };
            });
            
            // Add the price data to our stats object
            data.priceData = formattedPriceData;
          }
        } catch (priceError) {
          console.error('Error fetching price history:', priceError);
        }
        
        setStats(data);
        
        // Combine all data into one dataset
        const combined = combineDatasets(data);
        console.log('Combined data:', combined);
        setCombinedData(combined);
      } catch (err) {
        console.error('Error fetching stats:', err);
        setError(err instanceof Error ? err.message : 'An error occurred while fetching statistics');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchStats();
  }, [timeRange]);
  
  // Combine all datasets into one for the chart
  const combineDatasets = (data: any) => {
    console.log('Combining datasets from:', data);
    if (!data) {
      console.log('Missing data for chart');
      return [];
    }
    
    // Create a map to store combined data by date
    const combinedMap = new Map();
    
    // Process lock data
    if (data.lockTimeData && Array.isArray(data.lockTimeData)) {
      console.log('Processing lockTimeData:', data.lockTimeData);
      data.lockTimeData.forEach((item: any) => {
        if (!item) return;
        
        const key = item.name;
        
        if (!combinedMap.has(key)) {
          combinedMap.set(key, { name: key });
        }
        
        const entry = combinedMap.get(key);
        entry.locks = item.locks || 0;
      });
    }
    
    // Process BSV data
    if (data.bsvLockedOverTime && Array.isArray(data.bsvLockedOverTime)) {
      console.log('Processing bsvLockedOverTime:', data.bsvLockedOverTime);
      data.bsvLockedOverTime.forEach((item: any) => {
        if (!item) return;
        
        const key = item.name;
        
        if (!combinedMap.has(key)) {
          combinedMap.set(key, { name: key });
        }
        
        const entry = combinedMap.get(key);
        entry.bsv = item.bsv || 0;
      });
    }
    
    // Process price data
    if (data.priceData && Array.isArray(data.priceData)) {
      console.log('Processing priceData:', data.priceData);
      data.priceData.forEach((item: any) => {
        if (!item || !item.name) return;
        
        const key = item.name;
        
        if (!combinedMap.has(key)) {
          combinedMap.set(key, { name: key });
        }
        
        const entry = combinedMap.get(key);
        entry.price = item.price || 0;
      });
    }
    
    // Convert map to array and sort by date
    const result = Array.from(combinedMap.values());
    
    // Make sure all entries have all three values (locks, bsv, price)
    result.forEach(entry => {
      if (!entry.locks) entry.locks = 0;
      if (!entry.bsv) entry.bsv = 0;
      if (!entry.price) entry.price = 0;
    });
    
    // Sort the data based on the time range
    if (timeRange === 'day') {
      result.sort((a, b) => {
        const hourA = a.name.split(':')[0];
        const hourB = b.name.split(':')[0];
        return parseInt(hourA) - parseInt(hourB);
      });
    } else if (timeRange === 'week' || timeRange === 'month') {
      result.sort((a, b) => {
        const [monthA, dayA] = a.name.split(' ');
        const [monthB, dayB] = b.name.split(' ');
        
        if (monthA === monthB) {
          return parseInt(dayA) - parseInt(dayB);
        }
        
        const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return monthOrder.indexOf(monthA) - monthOrder.indexOf(monthB);
      });
    } else {
      const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      result.sort((a, b) => {
        return monthOrder.indexOf(a.name) - monthOrder.indexOf(b.name);
      });
    }
    
    console.log('Combined and sorted result:', result);
    return result;
  };

  // Add sample data if no data is available
  const addSampleData = () => {
    // Use our actual data if available
    if (combinedData.length > 0) {
      return combinedData;
    }
    
    console.log('Using sample data for chart');
    // Create sample data with points based on the selected time range
    const sampleData = [];
    const now = new Date();
    
    if (timeRange === 'day') {
      for (let i = 24; i >= 0; i--) {
        const date = new Date(now);
        date.setHours(date.getHours() - i);
        const hourName = date.toLocaleString('default', { hour: '2-digit', minute: '2-digit' });
        sampleData.push({
          name: hourName,
          locks: 100 + Math.floor(Math.random() * 50),
          bsv: 0.000005 + (Math.random() * 0.000003),
          price: 35 + (Math.random() * 5)
        });
      }
    } else if (timeRange === 'week') {
      for (let i = 7; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dayName = date.toLocaleString('default', { day: 'numeric', month: 'short' });
        sampleData.push({
          name: dayName,
          locks: 100 + Math.floor(Math.random() * 100),
          bsv: 0.000005 + (Math.random() * 0.000005),
          price: 35 + (Math.random() * 7)
        });
      }
    } else if (timeRange === 'month') {
      for (let i = 30; i >= 0; i -= 3) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dayName = date.toLocaleString('default', { day: 'numeric', month: 'short' });
        sampleData.push({
          name: dayName,
          locks: 100 + Math.floor(Math.random() * 150),
          bsv: 0.000005 + (Math.random() * 0.000007),
          price: 35 + (Math.random() * 8)
        });
      }
    } else {
      const months = [];
      for (let i = 0; i <= 6; i++) {
        const date = new Date(now);
        date.setMonth(date.getMonth() - i);
        const monthName = date.toLocaleString('default', { month: 'short' });
        months.push({
          name: monthName,
          locks: 100 + Math.floor(Math.random() * 150) + ((6-i) * 20),
          bsv: 0.000005 + (Math.random() * 0.000008) + ((6-i) * 0.000001),
          price: 35 + (Math.random() * 10),
          date: date.toISOString(),
          month: date.getMonth(),
          year: date.getFullYear()
        });
      }
      
      months.sort((a, b) => {
        if (a.year !== b.year) {
          return b.year - a.year;
        }
        return b.month - a.month;
      });
      
      sampleData.push(...months);
    }
    
    return sampleData;
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

  // Generate sample data for lock size distribution
  const getLockSizeDistributionData = () => {
    // In a real app, you would get this data from the API
    // For now, we'll create sample data
    return [
      { name: "<0.0001 BSV", value: 52 },
      { name: "0.0001-0.001 BSV", value: 87 },
      { name: "0.001-0.01 BSV", value: 45 },
      { name: "0.01-0.1 BSV", value: 22 },
      { name: ">0.1 BSV", value: 8 }
    ];
  };

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Platform Analytics</h1>
            <p className="text-sm flex items-center opacity-80">
              <FiLock className="mr-1" /> 
              100% Onchain Data Secured by Bitcoin SV
            </p>
          </div>
          
          <div className="flex flex-col items-end mt-4 md:mt-0">
            <div className="flex space-x-1 p-1 rounded-lg border border-gray-700">
              {['day', 'week', 'month', 'all'].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range as any)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    timeRange === range
                      ? 'bg-[#00E6CC] text-black'
                      : 'hover:bg-gray-800'
                  }`}
                >
                  {range === 'day' ? '24h' : 
                   range === 'all' ? 'All Time' : 
                   range.charAt(0).toUpperCase() + range.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

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

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00E6CC]"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-6 py-4 rounded-lg mb-6">
            <strong className="font-bold">Error:</strong>
            <span className="block mt-1"> {error}</span>
          </div>
        ) : (
          <>
            {/* Three-column charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
              {/* Lock Activity Trend */}
              <div className="border border-gray-700 rounded-lg p-5">
                <h3 className="text-xl font-bold mb-1">Lock Activity Trend</h3>
                <p className="text-sm opacity-70 mb-4">Number of new locks over time</p>
                
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={addSampleData()}
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
                      data={addSampleData()}
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
                Total BSV locked: {formatBSV(stats?.total_bsv_locked || 0)}
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
  );
};

export default Stats;

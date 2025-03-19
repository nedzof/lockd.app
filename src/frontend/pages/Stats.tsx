import { API_URL } from "../config";
import React, { useState, useEffect } from 'react';
import { FiBarChart2, FiLock, FiTrendingUp, FiClock, FiDollarSign, FiUsers } from 'react-icons/fi';
import { formatBSV } from '../utils/formatBSV';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
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

// Custom Tailwind gradient backgrounds
const gradients = {
  primary: "bg-gradient-to-r from-purple-600 to-indigo-600",
  secondary: "bg-gradient-to-r from-teal-500 to-cyan-500",
  tertiary: "bg-gradient-to-r from-pink-500 to-rose-500",
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

  return (
    <div className="min-h-screen bg-[#1A1B23] text-white">
      {/* Hero section with key metrics */}
      <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border-b border-gray-800">
        <div className="container mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Lockd Analytics</h1>
              <p className="text-[#00E6CC] text-sm flex items-center">
                <FiLock className="mr-1" /> 
                100% Onchain Data Secured by Bitcoin SV
              </p>
            </div>
            
            <div className="flex flex-col items-end mt-4 md:mt-0">
              <div className="flex space-x-1 bg-[#2A2A40] p-1 rounded-lg">
                {['day', 'week', 'month', 'all'].map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range as any)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      timeRange === range
                        ? 'bg-[#00E6CC] text-[#1A1B23]'
                        : 'text-white hover:bg-[#3A3A50]'
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 rounded-xl border border-purple-800/30 p-6 transform transition-all duration-300 hover:scale-105">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-300">Onchain Locks</h3>
                <FiLock className="h-6 w-6 text-purple-400" />
              </div>
              <p className="text-3xl font-bold text-white">{stats?.total_lock_likes || 0}</p>
              <p className="text-purple-400 text-sm mt-2">Secured on BSV blockchain</p>
            </div>
            
            <div className="bg-gradient-to-r from-teal-900/40 to-cyan-900/40 rounded-xl border border-teal-800/30 p-6 transform transition-all duration-300 hover:scale-105">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-300">BSV Locked</h3>
                <FiTrendingUp className="h-6 w-6 text-teal-400" />
              </div>
              <p className="text-3xl font-bold text-white">{formatBSV(stats?.total_bsv_locked || 0)}</p>
              <p className="text-teal-400 text-sm mt-2">Total value locked</p>
            </div>
            
            <div className="bg-gradient-to-r from-pink-900/40 to-rose-900/40 rounded-xl border border-pink-800/30 p-6 transform transition-all duration-300 hover:scale-105">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-300">BSV Price</h3>
                <FiDollarSign className="h-6 w-6 text-pink-400" />
              </div>
              <p className="text-3xl font-bold text-white">
                ${stats?.current_bsv_price ? stats.current_bsv_price.toFixed(2) : 'N/A'}
              </p>
              <p className="text-pink-400 text-sm mt-2">Current market price</p>
            </div>
            
            <div className="bg-gradient-to-r from-amber-900/40 to-orange-900/40 rounded-xl border border-amber-800/30 p-6 transform transition-all duration-300 hover:scale-105">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-300">Users</h3>
                <FiUsers className="h-6 w-6 text-amber-400" />
              </div>
              <p className="text-3xl font-bold text-white">{stats?.total_users || 0}</p>
              <p className="text-amber-400 text-sm mt-2">Active participants</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#00E6CC]"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-6 py-4 rounded-lg mb-6">
            <strong className="font-bold">Error:</strong>
            <span className="block mt-1"> {error}</span>
          </div>
        ) : (
          <>
            {/* Main chart section */}
            <div className="bg-[#24253B] rounded-xl shadow-xl border border-gray-800/30 mb-10 overflow-hidden">
              <div className="p-6">
                <h2 className="text-2xl font-bold text-white mb-1">Historical Metrics</h2>
                <p className="text-gray-400 text-sm mb-6">Time series data showing platform activity</p>
                
                <div className="h-[480px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={addSampleData()}
                      margin={{
                        top: 20,
                        right: 50,
                        left: 20,
                        bottom: 20,
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#444" opacity={0.3} />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fill: '#ccc' }} 
                        tickLine={{ stroke: '#666' }}
                        axisLine={{ stroke: '#666' }}
                        reversed={true}
                      />
                      <YAxis 
                        yAxisId="left" 
                        orientation="left" 
                        stroke="#9c7aff"
                        tick={{ fill: '#ccc' }}
                        tickLine={{ stroke: '#666' }}
                        axisLine={{ stroke: '#666' }}
                        domain={['auto', 'auto']}
                        allowDataOverflow={false}
                        label={{ value: 'Locks', angle: -90, position: 'insideLeft', fill: '#9c7aff', dy: 60 }}
                      />
                      <YAxis 
                        yAxisId="right" 
                        orientation="right" 
                        stroke="#00E6CC"
                        tick={{ fill: '#ccc' }}
                        tickLine={{ stroke: '#666' }}
                        axisLine={{ stroke: '#666' }}
                        tickFormatter={(value) => `${formatBSV(value)}`}
                        domain={['auto', 'auto']}
                        allowDataOverflow={false}
                        label={{ value: 'BSV Locked', angle: 90, position: 'insideRight', fill: '#00E6CC', dy: 60 }}
                      />
                      <YAxis 
                        yAxisId="price" 
                        orientation="right" 
                        stroke="#FF69B4"
                        tick={{ fontSize: 12, fill: '#ccc' }}
                        tickFormatter={(value) => `$${value}`}
                        domain={['dataMin - 1', 'dataMax + 1']}
                        axisLine={{ stroke: '#666' }}
                        tickLine={{ stroke: '#666' }}
                        width={50}
                        allowDataOverflow={false}
                        label={{ value: 'BSV Price', angle: 90, position: 'insideRight', fill: '#FF69B4', dy: 140 }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(28, 29, 49, 0.95)', 
                          border: '1px solid #666',
                          borderRadius: '8px',
                          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                          padding: '12px'
                        }}
                        labelStyle={{ color: '#fff', fontWeight: 'bold', marginBottom: '8px' }}
                        formatter={(value, name, props) => {
                          if (name === 'price') {
                            return [`$${value}`, 'BSV Price'];
                          } else if (name === 'locks') {
                            return [value, 'Total Locks'];
                          } else if (name === 'bsv') {
                            return [formatBSV(Number(value)), 'BSV Locked'];
                          }
                          return [value, name];
                        }}
                      />
                      <Legend 
                        wrapperStyle={{ color: '#ccc', paddingTop: '10px' }}
                        iconType="circle"
                        iconSize={10}
                        formatter={(value) => {
                          if (value === 'price') return 'BSV Price';
                          if (value === 'locks') return 'Total Locks';
                          if (value === 'bsv') return 'BSV Locked';
                          return value;
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="locks"
                        name="locks"
                        stroke="#9c7aff"
                        strokeWidth={3}
                        yAxisId="left"
                        dot={{ r: 4, fill: '#9c7aff', stroke: '#1A1B23', strokeWidth: 1 }}
                        activeDot={{ r: 6, fill: '#9c7aff', stroke: '#fff', strokeWidth: 2 }}
                        isAnimationActive={true}
                        animationDuration={1000}
                      />
                      <Line
                        type="monotone"
                        dataKey="bsv"
                        name="bsv"
                        stroke="#00E6CC"
                        strokeWidth={3}
                        yAxisId="right"
                        dot={{ r: 4, fill: '#00E6CC', stroke: '#1A1B23', strokeWidth: 1 }}
                        activeDot={{ r: 6, fill: '#00E6CC', stroke: '#fff', strokeWidth: 2 }}
                        isAnimationActive={true}
                        animationDuration={1000}
                      />
                      <Line
                        type="monotone"
                        dataKey="price"
                        name="price"
                        stroke="#FF69B4"
                        strokeWidth={3}
                        yAxisId="price"
                        dot={{ r: 4, fill: '#FF69B4', stroke: '#1A1B23', strokeWidth: 1 }}
                        activeDot={{ r: 6, fill: '#FF69B4', stroke: '#fff', strokeWidth: 2 }}
                        isAnimationActive={true}
                        animationDuration={1000}
                      />
                      <Brush 
                        dataKey="name" 
                        height={30} 
                        stroke="#666"
                        fill="#2A2A40"
                        tickFormatter={(tick) => ''}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Secondary charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Lock Distribution */}
              <div className="bg-[#24253B] rounded-xl border border-gray-800/30 p-6 shadow-lg">
                <h3 className="text-xl font-bold text-white mb-1">Lock Distribution</h3>
                <p className="text-gray-400 text-sm mb-4">Visualizing lock activity trends</p>
                
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={addSampleData()}
                      margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#444" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fill: '#ccc' }} reversed={true} />
                      <YAxis tick={{ fill: '#ccc' }} />
                      <Tooltip
                        contentStyle={{ 
                          backgroundColor: 'rgba(28, 29, 49, 0.95)', 
                          border: '1px solid #666',
                          borderRadius: '8px'
                        }}
                        formatter={(value) => [`${value}`, 'Locks']}
                      />
                      <Bar 
                        dataKey="locks" 
                        fill="#9c7aff" 
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={true}
                        animationDuration={1200}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* BSV Locked Over Time */}
              <div className="bg-[#24253B] rounded-xl border border-gray-800/30 p-6 shadow-lg">
                <h3 className="text-xl font-bold text-white mb-1">BSV Value Locked</h3>
                <p className="text-gray-400 text-sm mb-4">Total BSV locked across time periods</p>
                
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={addSampleData()}
                      margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
                    >
                      <defs>
                        <linearGradient id="bsvGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00E6CC" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#00E6CC" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#444" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fill: '#ccc' }} reversed={true} />
                      <YAxis tick={{ fill: '#ccc' }} tickFormatter={(value) => formatBSV(value)} />
                      <Tooltip
                        contentStyle={{ 
                          backgroundColor: 'rgba(28, 29, 49, 0.95)', 
                          border: '1px solid #666',
                          borderRadius: '8px'
                        }}
                        formatter={(value) => [formatBSV(Number(value)), 'BSV Locked']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="bsv" 
                        stroke="#00E6CC" 
                        fillOpacity={1} 
                        fill="url(#bsvGradient)"
                        isAnimationActive={true}
                        animationDuration={1200}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Latest activity and duration info */}
            <div className="bg-[#24253B] rounded-xl border border-gray-800/30 p-6 shadow-lg mb-8">
              <div className="flex flex-col md:flex-row justify-between">
                <div className="mb-6 md:mb-0">
                  <h3 className="text-xl font-bold text-white mb-2">Average Lock Duration</h3>
                  <div className="flex items-center space-x-2">
                    <FiClock className="h-5 w-5 text-[#00E6CC]" />
                    <span className="text-2xl font-bold text-white">
                      {Math.round(stats?.avg_lock_duration || 0).toLocaleString()} blocks
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm mt-2">Average time before locks can be unlocked</p>
                </div>
                
                <div className="border-l border-gray-700 mx-4 hidden md:block"></div>
                
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">Most Active User</h3>
                  <div className="bg-[#2A2A40] rounded-lg p-2 inline-block">
                    <span className="text-[#00E6CC] font-mono">
                      {stats?.most_active_user ? `${stats.most_active_user.substring(0, 6)}...${stats.most_active_user.substring(stats.most_active_user.length - 4)}` : 'N/A'}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm mt-2">User with most locks and interactions</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center my-8">
              <div className="text-sm text-gray-400 flex items-center">
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

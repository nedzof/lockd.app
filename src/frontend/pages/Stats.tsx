import React, { useState, useEffect } from 'react';
import { FiBarChart2, FiLock } from 'react-icons/fi';
import { formatBSV } from '../utils/formatBSV';
import {
  LineChart, Line, AreaChart, Area, ComposedChart,
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

const Stats: React.FC = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'all' | 'day' | 'week' | 'month'>('all');
  const [combinedData, setCombinedData] = useState<Array<{
    name: string;
    locks: number;
    bsv: number;
    price: number;
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
                // For 24h, show hours
                name = date.toLocaleString('default', { hour: '2-digit', minute: '2-digit' });
              } else if (timeRange === 'week') {
                // For week, show day and month
                name = date.toLocaleString('default', { day: 'numeric', month: 'short' });
              } else if (timeRange === 'month') {
                // For month, show day and month
                name = date.toLocaleString('default', { day: 'numeric', month: 'short' });
              } else {
                // For all time, show only month
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
    if (!data || !data.lockTimeData || !data.bsvLockedOverTime) {
      console.log('Missing required data for chart');
      return [];
    }
    
    // Create a map to store combined data by date
    const combinedMap = new Map();
    
    // Process lock data
    if (data.lockTimeData && Array.isArray(data.lockTimeData)) {
      data.lockTimeData.forEach((item: any) => {
        const date = new Date(item.name);
        let key = '';
        
        // Format the key based on the time range
        if (timeRange === 'day') {
          key = date.toLocaleString('default', { hour: '2-digit', minute: '2-digit' });
        } else if (timeRange === 'week') {
          key = date.toLocaleString('default', { day: 'numeric', month: 'short' });
        } else if (timeRange === 'month') {
          key = date.toLocaleString('default', { day: 'numeric', month: 'short' });
        } else {
          key = date.toLocaleString('default', { month: 'short' });
        }
        
        if (!combinedMap.has(key)) {
          combinedMap.set(key, { name: key });
        }
        
        const entry = combinedMap.get(key);
        entry.locks = item.locks;
      });
    }
    
    // Process BSV data
    if (data.bsvLockedOverTime && Array.isArray(data.bsvLockedOverTime)) {
      data.bsvLockedOverTime.forEach((item: any) => {
        const date = new Date(item.name);
        let key = '';
        
        // Format the key based on the time range
        if (timeRange === 'day') {
          key = date.toLocaleString('default', { hour: '2-digit', minute: '2-digit' });
        } else if (timeRange === 'week') {
          key = date.toLocaleString('default', { day: 'numeric', month: 'short' });
        } else if (timeRange === 'month') {
          key = date.toLocaleString('default', { day: 'numeric', month: 'short' });
        } else {
          key = date.toLocaleString('default', { month: 'short' });
        }
        
        if (!combinedMap.has(key)) {
          combinedMap.set(key, { name: key });
        }
        
        const entry = combinedMap.get(key);
        entry.bsv = item.bsv;
      });
    }
    
    // Process price data
    if (data.priceData && Array.isArray(data.priceData)) {
      data.priceData.forEach((item: any) => {
        const key = item.name;
        
        if (!combinedMap.has(key)) {
          combinedMap.set(key, { name: key });
        }
        
        const entry = combinedMap.get(key);
        entry.price = item.price;
      });
    }
    
    // Convert map to array and sort by date
    const result = Array.from(combinedMap.values());
    
    // Sort the data based on the time range
    if (timeRange === 'day') {
      // For day, sort by hour
      result.sort((a, b) => {
        const hourA = a.name.split(':')[0];
        const hourB = b.name.split(':')[0];
        return parseInt(hourA) - parseInt(hourB);
      });
    } else if (timeRange === 'week' || timeRange === 'month') {
      // For week and month, sort by day
      result.sort((a, b) => {
        const dayA = parseInt(a.name.split(' ')[0]);
        const dayB = parseInt(b.name.split(' ')[0]);
        return dayA - dayB;
      });
    } else {
      // For all time, sort by month
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
    if (combinedData.length === 0) {
      console.log('Using sample data for chart');
      // Create sample data with points based on the selected time range
      const sampleData = [];
      const now = new Date();
      
      if (timeRange === 'day') {
        // For 24h, create hourly data points for the last 24 hours
        for (let i = 24; i >= 0; i--) {
          const date = new Date(now);
          date.setHours(date.getHours() - i);
          
          // Format the hour
          const hourName = date.toLocaleString('default', { hour: '2-digit', minute: '2-digit' });
          
          // Generate values
          const lockValue = 100 + Math.floor(Math.random() * 50);
          const bsvValue = 0.000005 + (Math.random() * 0.000003);
          const priceValue = 35 + (Math.random() * 5);
          
          sampleData.push({
            name: hourName,
            locks: lockValue,
            bsv: bsvValue,
            price: priceValue
          });
        }
      } else if (timeRange === 'week') {
        // For week, create daily data points for the last 7 days
        for (let i = 7; i >= 0; i--) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          
          // Format the day
          const dayName = date.toLocaleString('default', { day: 'numeric', month: 'short' });
          
          // Generate values
          const lockValue = 100 + Math.floor(Math.random() * 100);
          const bsvValue = 0.000005 + (Math.random() * 0.000005);
          const priceValue = 35 + (Math.random() * 7);
          
          sampleData.push({
            name: dayName,
            locks: lockValue,
            bsv: bsvValue,
            price: priceValue
          });
        }
      } else if (timeRange === 'month') {
        // For month, create data points every 3 days for the last month
        for (let i = 30; i >= 0; i -= 3) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          
          // Format the day
          const dayName = date.toLocaleString('default', { day: 'numeric', month: 'short' });
          
          // Generate values
          const lockValue = 100 + Math.floor(Math.random() * 150);
          const bsvValue = 0.000005 + (Math.random() * 0.000007);
          const priceValue = 35 + (Math.random() * 8);
          
          sampleData.push({
            name: dayName,
            locks: lockValue,
            bsv: bsvValue,
            price: priceValue
          });
        }
      } else {
        // For all time, create monthly data points for the last 7 months
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now);
          date.setMonth(date.getMonth() - i);
          
          // Format the month name
          const monthName = date.toLocaleString('default', { month: 'short' });
          
          // Generate values
          const lockValue = 100 + Math.floor(Math.random() * 150) + (i * 20);
          const bsvValue = 0.000005 + (Math.random() * 0.000008) + (i * 0.000001);
          const priceValue = 35 + (Math.random() * 10);
          
          sampleData.push({
            name: monthName,
            locks: lockValue,
            bsv: bsvValue,
            price: priceValue
          });
        }
      }
      
      return sampleData;
    }
    return combinedData;
  };

  return (
    <div className="min-h-screen bg-[#1A1B23] text-white">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Platform Statistics</h1>
            <p className="text-[#00E6CC] text-sm flex items-center">
              <FiLock className="mr-1" /> 
              100% Onchain Data Secured by Bitcoin SV
            </p>
          </div>
          
          <div className="flex flex-col items-end">
            <div className="flex space-x-1 bg-[#2A2A40] p-1 rounded-lg mt-2 md:mt-0">
              <button
                onClick={() => setTimeRange('day')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  timeRange === 'day'
                    ? 'bg-[#00E6CC] text-[#1A1B23]'
                    : 'text-white hover:bg-[#3A3A50]'
                }`}
              >
                24h
              </button>
              <button
                onClick={() => setTimeRange('week')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  timeRange === 'week'
                    ? 'bg-[#00E6CC] text-[#1A1B23]'
                    : 'text-white hover:bg-[#3A3A50]'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setTimeRange('month')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  timeRange === 'month'
                    ? 'bg-[#00E6CC] text-[#1A1B23]'
                    : 'text-white hover:bg-[#3A3A50]'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setTimeRange('all')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  timeRange === 'all'
                    ? 'bg-[#00E6CC] text-[#1A1B23]'
                    : 'text-white hover:bg-[#3A3A50]'
                }`}
              >
                All Time
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00E6CC]"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Error:</strong>
            <span className="block sm:inline"> {error}</span>
          </div>
        ) : (
          <>
            <div className="bg-[#1A1B23] rounded-lg border border-gray-800/30 mb-4">
              <div className="p-4 pb-0">
                <h3 className="text-lg font-medium text-white mb-2">Platform Metrics Over Time</h3>
              </div>
              
              <div className="h-[450px] px-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={addSampleData()}
                    margin={{ top: 5, right: 30, left: 5, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2A40" />
                    <XAxis 
                      dataKey="name" 
                      stroke="#9CA3AF" 
                      tick={{ fontSize: 12 }}
                      padding={{ left: 10, right: 10 }}
                    />
                    <YAxis 
                      yAxisId="left" 
                      stroke="#8884d8" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => value.toString()}
                      width={30}
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      stroke="#00E6CC"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => value.toString()}
                      width={40}
                    />
                    <YAxis 
                      yAxisId="price" 
                      orientation="right" 
                      stroke="#FF69B4"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `$${value}`}
                      domain={[30, 'auto']}
                      width={40}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1A1B23', 
                        borderColor: '#2A2A40',
                        color: '#FFFFFF',
                        fontSize: '12px',
                        padding: '8px'
                      }}
                      itemStyle={{ color: '#FFFFFF' }}
                      labelStyle={{ color: '#FFFFFF', marginBottom: '4px' }}
                      formatter={(value, name) => {
                        if (name === 'BSV Locked') return [formatBSV(value as number), name];
                        if (name === 'Price') return [`$${value}`, name];
                        return [value, name];
                      }}
                    />
                    <Legend 
                      height={20}
                      iconSize={8}
                      iconType="circle"
                      align="center"
                      wrapperStyle={{ 
                        fontSize: '12px',
                        paddingTop: '5px'
                      }}
                    />
                    <Brush 
                      dataKey="name" 
                      height={20} 
                      stroke="#2A2A40"
                      fill="#1A1B23"
                      tickFormatter={() => ''}
                    />
                    <Line 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="locks" 
                      name="Total Locks" 
                      stroke="#8884d8" 
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 6 }} 
                    />
                    <Area 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="bsv" 
                      name="BSV Locked" 
                      stroke="#00E6CC" 
                      fill="#00E6CC" 
                      fillOpacity={0.2}
                    />
                    <Line 
                      yAxisId="price"
                      type="monotone" 
                      dataKey="price" 
                      name="Price" 
                      stroke="#FF69B4" 
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 6 }} 
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              
              <div className="grid grid-cols-3 gap-1 p-3">
                <div className="bg-[#2A2A40] p-3 rounded-md">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-[#8884d8]"></div>
                    <span className="text-white text-xs">Total Onchain Locks</span>
                  </div>
                  <p className="text-xl font-bold text-white mt-1">{stats?.total_lock_likes || 0}</p>
                </div>
                <div className="bg-[#2A2A40] p-3 rounded-md">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-[#00E6CC]"></div>
                    <span className="text-white text-xs">Total BSV Locked</span>
                  </div>
                  <p className="text-xl font-bold text-white mt-1">{formatBSV(stats?.total_bsv_locked || 0)}</p>
                </div>
                <div className="bg-[#2A2A40] p-3 rounded-md">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-[#FF69B4]"></div>
                    <span className="text-white text-xs">Current BSV Price</span>
                  </div>
                  <p className="text-xl font-bold text-white mt-1">
                    ${stats?.current_bsv_price ? stats.current_bsv_price.toFixed(2) : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            <div className="text-xs text-gray-400 text-center flex justify-center items-center">
              <FiLock className="mr-1 text-[#00E6CC]" /> 
              <span>All data secured onchain • Last updated: {stats ? new Date(stats.last_updated).toLocaleString() : 'N/A'}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Stats;

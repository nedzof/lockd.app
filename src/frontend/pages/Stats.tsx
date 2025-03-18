import { API_URL } from "../config";
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
    date?: string; // Optional date property
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
    if (!data) {
      console.log('Missing data for chart');
      return [];
    }
    
    // Create a map to store combined data by date
    const combinedMap = new Map();
    
    // Process lock data
    if (data.lockTimeData && Array.isArray(data.lockTimeData)) {
      data.lockTimeData.forEach((item: any) => {
        if (!item || !item.date) return;
        
        const date = new Date(item.date);
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
        entry.locks = item.count || 0;
      });
    }
    
    // Process BSV data
    if (data.bsvLockedOverTime && Array.isArray(data.bsvLockedOverTime)) {
      data.bsvLockedOverTime.forEach((item: any) => {
        if (!item || !item.date) return;
        
        const date = new Date(item.date);
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
        entry.bsv = item.amount || 0;
      });
    }
    
    // Process price data
    if (data.priceData && Array.isArray(data.priceData)) {
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
      // For day, sort by hour
      result.sort((a, b) => {
        const hourA = a.name.split(':')[0];
        const hourB = b.name.split(':')[0];
        return parseInt(hourA) - parseInt(hourB); // Normal order (oldest to newest)
      });
    } else if (timeRange === 'week' || timeRange === 'month') {
      // For week and month, sort by day
      result.sort((a, b) => {
        const dayA = parseInt(a.name.split(' ')[0]);
        const dayB = parseInt(b.name.split(' ')[0]);
        return dayA - dayB; // Normal order (oldest to newest)
      });
    } else {
      // For all time, we need to sort in reverse chronological order (newest to oldest)
      // Since the XAxis has reversed={true}, this will make it display newest first on the left
      const monthOrder = ['Dec', 'Nov', 'Oct', 'Sep', 'Aug', 'Jul', 'Jun', 'May', 'Apr', 'Mar', 'Feb', 'Jan'];
      
      // Sort by month (December to January)
      result.sort((a, b) => {
        const monthIndexA = monthOrder.indexOf(a.name);
        const monthIndexB = monthOrder.indexOf(b.name);
        return monthIndexA - monthIndexB;
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
        // Sort them newest to oldest so when the XAxis reverses them, they display correctly
        const months = [];
        
        // Get all months needed (from current month going back)
        for (let i = 0; i <= 6; i++) {
          const date = new Date(now);
          date.setMonth(date.getMonth() - i);
          
          // Format the month name
          const monthName = date.toLocaleString('default', { month: 'short' });
          
          // Generate values
          const lockValue = 100 + Math.floor(Math.random() * 150) + ((6-i) * 20); // More locks in later months
          const bsvValue = 0.000005 + (Math.random() * 0.000008) + ((6-i) * 0.000001);
          const priceValue = 35 + (Math.random() * 10);
          
          months.push({
            name: monthName,
            locks: lockValue,
            bsv: bsvValue,
            price: priceValue,
            date: date.toISOString(),
            month: date.getMonth(),
            year: date.getFullYear()
          });
        }
        
        // Sort newest to oldest (reverse chronological)
        months.sort((a, b) => {
          if (a.year !== b.year) {
            return b.year - a.year; // Newest year first
          }
          return b.month - a.month; // Newest month first
        });
        
        sampleData.push(...months);
      }
      
      console.log('Sample data months in order:', sampleData.map(item => item.name).join(', '));
      return sampleData;
    }
    
    if (timeRange === 'all') {
      // Ensure months are in reverse chronological order for the "All Time" view
      // This matches the approach in combineDatasets
      const monthOrder = ['Dec', 'Nov', 'Oct', 'Sep', 'Aug', 'Jul', 'Jun', 'May', 'Apr', 'Mar', 'Feb', 'Jan'];
      
      // Create a copy to sort
      const sortedData = [...combinedData];
      
      // Sort by month index in reverse chronological order
      sortedData.sort((a, b) => {
        const monthIndexA = monthOrder.indexOf(a.name);
        const monthIndexB = monthOrder.indexOf(b.name);
        return monthIndexA - monthIndexB;
      });
      
      console.log('Combined data months in order (sorted):', sortedData.map(item => item.name).join(', '));
      return sortedData;
    }
    
    console.log('Combined data months in order:', combinedData.map(item => item.name).join(', '));
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
              100% Onchain Data Secured by ₿
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
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart
                    data={addSampleData()}
                    margin={{
                      top: 20,
                      right: 40,
                      left: 20,
                      bottom: 20,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fill: '#ccc' }} 
                      tickLine={{ stroke: '#666' }}
                      axisLine={{ stroke: '#666' }}
                      reversed={true} // Reverse the X-axis direction
                    />
                    <YAxis 
                      yAxisId="left" 
                      orientation="left" 
                      stroke="#8884d8"
                      tick={{ fill: '#ccc' }}
                      tickLine={{ stroke: '#666' }}
                      axisLine={{ stroke: '#666' }}
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      stroke="#82ca9d"
                      tick={{ fill: '#ccc' }}
                      tickLine={{ stroke: '#666' }}
                      axisLine={{ stroke: '#666' }}
                      tickFormatter={(value) => `${value}`}
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
                      contentStyle={{ backgroundColor: '#333', border: '1px solid #666' }}
                      labelStyle={{ color: '#fff' }}
                      formatter={(value, name) => {
                        if (name === 'price') {
                          return [`$${value}`, 'BSV Price'];
                        } else if (name === 'locks') {
                          return [value, 'Total Locks'];
                        } else if (name === 'bsv') {
                          return [value, 'BSV Locked'];
                        }
                        return [value, name];
                      }}
                    />
                    <Legend wrapperStyle={{ color: '#ccc' }} />
                    <Line
                      type="monotone"
                      dataKey="locks"
                      name="Total Locks"
                      stroke="#8884d8"
                      yAxisId="left"
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="bsv"
                      name="BSV Locked"
                      stroke="#82ca9d"
                      yAxisId="right"
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      name="Price"
                      stroke="#FF69B4"
                      yAxisId="price"
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
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

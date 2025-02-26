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
        
        // Add sample price data if not available
        if (!data.priceData) {
          data.priceData = [
            { name: 'Jan', price: 45 },
            { name: 'Feb', price: 52 },
            { name: 'Mar', price: 49 },
            { name: 'Apr', price: 62 },
            { name: 'May', price: 55 },
            { name: 'Jun', price: 60 },
            { name: 'Jul', price: 68 },
          ];
        }
        
        setStats(data);
        
        // Combine all data into one dataset
        const combined = combineDatasets(data);
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
  
  // Function to combine all datasets into one
  const combineDatasets = (data: StatsData) => {
    // Create a map of all time periods
    const timeMap = new Map<string, { locks: number; bsv: number; price: number }>();
    
    // Add lock data
    (data.lockTimeData || []).forEach(item => {
      if (!timeMap.has(item.name)) {
        timeMap.set(item.name, { locks: 0, bsv: 0, price: 0 });
      }
      timeMap.get(item.name)!.locks = item.locks;
    });
    
    // Add BSV locked data
    (data.bsvLockedOverTime || []).forEach(item => {
      if (!timeMap.has(item.name)) {
        timeMap.set(item.name, { locks: 0, bsv: 0, price: 0 });
      }
      timeMap.get(item.name)!.bsv = item.bsv;
    });
    
    // Add price data
    (data.priceData || []).forEach(item => {
      if (!timeMap.has(item.name)) {
        timeMap.set(item.name, { locks: 0, bsv: 0, price: 0 });
      }
      timeMap.get(item.name)!.price = item.price;
    });
    
    // Convert map to array and sort by name
    const result = Array.from(timeMap.entries()).map(([name, values]) => ({
      name,
      ...values
    }));
    
    // Sort by name (assuming names are months or dates)
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    result.sort((a, b) => {
      // If names are months
      if (monthOrder.includes(a.name) && monthOrder.includes(b.name)) {
        return monthOrder.indexOf(a.name) - monthOrder.indexOf(b.name);
      }
      // Otherwise sort alphabetically
      return a.name.localeCompare(b.name);
    });
    
    return result;
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
                    data={combinedData}
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
                      stroke="#FF8042"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `$${value}`}
                      width={40}
                      axisLine={false}
                      tickLine={false}
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
                        if (name === 'BSV Price') return [`$${value}`, name];
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
                      name="BSV Price" 
                      stroke="#FF8042" 
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
                    <div className="w-2 h-2 rounded-full bg-[#FF8042]"></div>
                    <span className="text-white text-xs">Current BSV Price</span>
                  </div>
                  <p className="text-xl font-bold text-white mt-1">${combinedData.length > 0 ? combinedData[combinedData.length - 1].price : 'N/A'}</p>
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

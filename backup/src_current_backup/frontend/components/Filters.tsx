import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';

const tabs = [
  { id: 'trending', name: 'Trending' },
  { id: 'latest', name: 'Latest' },
];

const sortOptions = [
  { id: 'trending', name: 'Trending' },
  { id: 'latest', name: 'Latest' },
  { id: 'most_locked', name: 'Most Locked' },
];

const filterOptions = [
  { id: 'all', name: 'All Time' },
  { id: '24h', name: '24h' },
  { id: '7d', name: '7d' },
  { id: '30d', name: '30d' },
];

const filterOptions2 = [
  { id: 'all', name: 'All' },
  { id: 'viral', name: 'Viral' },
  { id: 'meme', name: 'Meme' },
];

const blockFilterOptions = [
  { id: 'last_block', name: 'Last Block' },
  { id: 'last_5_blocks', name: 'Last 5 Blocks' },
  { id: 'last_10_blocks', name: 'Last 10 Blocks' },
];

export default function Filters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'trending';
  const activeSort = searchParams.get('sort') || 'trending';
  const activeFilter = searchParams.get('filter') || 'all';
  const activeFilter2 = searchParams.get('filter2') || 'all';
  const activeBlockFilter = searchParams.get('block_filter') || '';

  const handleTabChange = (tabId: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tabId);
    setSearchParams(newParams);
  };

  const handleSortChange = (sortId: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', sortId);
    setSearchParams(newParams);
  };

  const handleFilterChange = (filterId: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('filter', filterId);
    setSearchParams(newParams);
  };

  const handleFilter2Change = (filterId: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('filter2', filterId);
    setSearchParams(newParams);
  };

  const handleBlockFilterChange = (filterId: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (activeBlockFilter === filterId) {
      newParams.delete('block_filter');
    } else {
      newParams.set('block_filter', filterId);
    }
    setSearchParams(newParams);
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#2A2A40] border border-gray-800 rounded-lg p-4">
        <nav className="flex space-x-4" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={clsx(
                'px-3 py-1 text-sm font-medium rounded-md',
                activeTab === tab.id
                  ? 'bg-[#1A1B23] text-[#00ffa3]'
                  : 'text-gray-400 hover:text-white'
              )}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      <div className="bg-[#2A2A40] border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Sort by</h3>
        <div className="space-y-2">
          {sortOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => handleSortChange(option.id)}
              className={clsx(
                'block w-full text-left px-3 py-1 text-sm font-medium rounded-md',
                activeSort === option.id
                  ? 'bg-[#1A1B23] text-[#00ffa3]'
                  : 'text-gray-400 hover:text-white'
              )}
            >
              {option.name}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#2A2A40] border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Time Range</h3>
        <div className="space-y-2">
          {filterOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => handleFilterChange(option.id)}
              className={clsx(
                'block w-full text-left px-3 py-1 text-sm font-medium rounded-md',
                activeFilter === option.id
                  ? 'bg-[#1A1B23] text-[#00ffa3]'
                  : 'text-gray-400 hover:text-white'
              )}
            >
              {option.name}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#2A2A40] border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Block Range</h3>
        <div className="space-y-2">
          {blockFilterOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => handleBlockFilterChange(option.id)}
              className={clsx(
                'block w-full text-left px-3 py-1 text-sm font-medium rounded-md',
                activeBlockFilter === option.id
                  ? 'bg-[#1A1B23] text-[#00ffa3]'
                  : 'text-gray-400 hover:text-white'
              )}
            >
              {option.name}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#2A2A40] border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Categories</h3>
        <div className="space-y-2">
          {filterOptions2.map((option) => (
            <button
              key={option.id}
              onClick={() => handleFilter2Change(option.id)}
              className={clsx(
                'block w-full text-left px-3 py-1 text-sm font-medium rounded-md',
                activeFilter2 === option.id
                  ? 'bg-[#1A1B23] text-[#00ffa3]'
                  : 'text-gray-400 hover:text-white'
              )}
            >
              {option.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
} 
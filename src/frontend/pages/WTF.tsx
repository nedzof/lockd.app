import * as React from 'react';
import { FiLock, FiZap, FiCheckCircle } from 'react-icons/fi';

export default function WTF() {
  return (
    <div className="max-w-full mx-auto py-6 px-4">
      <header className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">What is Lockd.app?</h1>
        <p className="text-lg text-gray-300 max-w-md mx-auto">
          A simple way to support content with ₿
        </p>
      </header>
      
      <div className="space-y-6">
        {/* Main explanation */}
        <section className="bg-[#1A1B23] rounded-xl p-5 shadow-lg border border-gray-800">
          <p className="text-gray-200 leading-relaxed text-lg mb-4">
            Lockd.app lets you <span className="text-[#00ffa3] font-medium">temporarily lock BSV tokens</span> on content you value.
          </p>
          <p className="text-gray-200 leading-relaxed text-lg">
            Your tokens are safe and will return to you after the lock period.
          </p>
        </section>

        {/* Key benefits - simplified list */}
        <section className="bg-[#1A1B23] rounded-xl p-5 shadow-lg border border-gray-800">
          <h2 className="text-2xl font-semibold text-white mb-4">Benefits</h2>
          
          <ul className="space-y-4">
            <li className="flex items-center">
              <div className="p-2 bg-[#00ffa3]/10 rounded-lg mr-3">
                <FiLock className="text-[#00ffa3] w-5 h-5" />
              </div>
              <p className="text-lg text-gray-200">
                <span className="text-white font-medium">Support real value</span> - Show appreciation with actual weight
              </p>
            </li>
            
            <li className="flex items-center">
              <div className="p-2 bg-[#00ffa3]/10 rounded-lg mr-3">
                <FiZap className="text-[#00ffa3] w-5 h-5" />
              </div>
              <p className="text-lg text-gray-200">
                <span className="text-white font-medium">Boost visibility</span> - The best content rises to the top
              </p>
            </li>
            
            <li className="flex items-center">
              <div className="p-2 bg-[#00ffa3]/10 rounded-lg mr-3">
                <FiCheckCircle className="text-[#00ffa3] w-5 h-5" />
              </div>
              <p className="text-lg text-gray-200">
                <span className="text-white font-medium">Earn rewards</span> - Creators get paid for quality
              </p>
            </li>
          </ul>
        </section>

        {/* Quick start - simplified */}
        <section className="bg-[#1A1B23] rounded-xl p-5 shadow-lg border border-gray-800">
          <h2 className="text-2xl font-semibold text-white mb-4">How to Start</h2>
          
          <ol className="space-y-4 list-decimal pl-5">
            <li className="text-gray-200 text-lg pl-2">
              Connect your BSV wallet
            </li>
            <li className="text-gray-200 text-lg pl-2">
              Find content you love
            </li>
            <li className="text-gray-200 text-lg pl-2">
              Lock BSV to show appreciation
            </li>
            <li className="text-gray-200 text-lg pl-2">
              Create content and de-psyop social media
            </li>
          </ol>
          
          <div className="mt-6 text-center">
            <a href="/" className="inline-block bg-[#00ffa3] text-black font-bold py-3 px-8 rounded-lg text-xl w-full sm:w-auto">
              Get Started
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
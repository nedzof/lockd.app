import * as React from 'react';
import { FiLock, FiZap, FiTrendingUp, FiGift, FiHelpCircle, FiCheckCircle } from 'react-icons/fi';

export default function WTF() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6">
      <header className="text-center mb-12">
        <h1 className="text-5xl font-bold text-white mb-4">WTF is Lockd.app? 🤔</h1>
        <p className="text-xl text-gray-300 max-w-2xl mx-auto">
          A new way to appreciate content with real value using Bitcoin SV
        </p>
      </header>
      
      <div className="space-y-10">
        {/* What is it? */}
        <section className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] rounded-xl p-8 shadow-lg border border-gray-800">
          <div className="flex items-center mb-6">
            <FiHelpCircle className="text-[#00ffa3] w-8 h-8 mr-3" />
            <h2 className="text-3xl font-semibold text-[#00ffa3]">What is it?</h2>
          </div>
          <p className="text-gray-200 leading-relaxed text-lg mb-6">
            Lockd.app is a social platform where you can lock BSV (Bitcoin SV) tokens to show appreciation for content. 
            Think of it as <span className="font-medium text-white">"putting your money where your mouth is"</span> - instead of just liking a post, you temporarily 
            lock some BSV to show real value.
          </p>
        </section>

        {/* How does it work? */}
        <section className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] rounded-xl p-8 shadow-lg border border-gray-800">
          <div className="flex items-center mb-8">
            <FiZap className="text-[#ff00ff] w-8 h-8 mr-3" />
            <h2 className="text-3xl font-semibold text-[#ff00ff]">How does it work?</h2>
          </div>
          
          <div className="grid gap-8 md:grid-cols-3">
            <div className="bg-gray-900 bg-opacity-50 rounded-lg p-6 transition-transform hover:scale-105">
              <div className="p-4 bg-[#ff00ff] bg-opacity-10 rounded-lg inline-block mb-4">
                <FiLock className="text-[#ff00ff] w-7 h-7" />
              </div>
              <h3 className="text-xl text-white font-medium mb-3">Lock your BSV</h3>
              <p className="text-gray-300 leading-relaxed">
                When you see content you love, you can lock some BSV for a period of time. This BSV isn't spent - 
                it's just temporarily locked and will return to you after the lock period.
              </p>
            </div>

            <div className="bg-gray-900 bg-opacity-50 rounded-lg p-6 transition-transform hover:scale-105">
              <div className="p-4 bg-[#00ffa3] bg-opacity-10 rounded-lg inline-block mb-4">
                <FiZap className="text-[#00ffa3] w-7 h-7" />
              </div>
              <h3 className="text-xl text-white font-medium mb-3">Boost Content</h3>
              <p className="text-gray-300 leading-relaxed">
                The more BSV locked on a post, the more visibility it gets. This creates a genuine value-based 
                ranking system where the best content rises to the top.
              </p>
            </div>

            <div className="bg-gray-900 bg-opacity-50 rounded-lg p-6 transition-transform hover:scale-105">
              <div className="p-4 bg-[#00ffff] bg-opacity-10 rounded-lg inline-block mb-4">
                <FiTrendingUp className="text-[#00ffff] w-7 h-7" />
              </div>
              <h3 className="text-xl text-white font-medium mb-3">Earn Rewards</h3>
              <p className="text-gray-300 leading-relaxed">
                Content creators can earn rewards when their posts accumulate locked BSV. The more value you create, 
                the more you can earn.
              </p>
            </div>
          </div>
        </section>

        {/* Why use it? */}
        <section className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] rounded-xl p-8 shadow-lg border border-gray-800">
          <div className="flex items-center mb-8">
            <FiCheckCircle className="text-[#00ffff] w-8 h-8 mr-3" />
            <h2 className="text-3xl font-semibold text-[#00ffff]">Why use it?</h2>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-gray-900 bg-opacity-40 rounded-lg p-5 flex items-start">
              <span className="text-2xl mr-3">🎯</span>
              <div>
                <h3 className="text-white font-medium text-lg mb-1">Real Value</h3>
                <p className="text-gray-300">Your appreciation has actual weight behind it</p>
              </div>
            </div>
            
            <div className="bg-gray-900 bg-opacity-40 rounded-lg p-5 flex items-start">
              <span className="text-2xl mr-3">💎</span>
              <div>
                <h3 className="text-white font-medium text-lg mb-1">Quality Content</h3>
                <p className="text-gray-300">Content is ranked by actual value, not just clicks</p>
              </div>
            </div>
            
            <div className="bg-gray-900 bg-opacity-40 rounded-lg p-5 flex items-start">
              <span className="text-2xl mr-3">🌱</span>
              <div>
                <h3 className="text-white font-medium text-lg mb-1">Support Creators</h3>
                <p className="text-gray-300">Help creators earn from their work</p>
              </div>
            </div>
            
            <div className="bg-gray-900 bg-opacity-40 rounded-lg p-5 flex items-start">
              <span className="text-2xl mr-3">🔒</span>
              <div>
                <h3 className="text-white font-medium text-lg mb-1">Safe</h3>
                <p className="text-gray-300">Your BSV is never at risk - it's just temporarily locked</p>
              </div>
            </div>
          </div>
        </section>

        {/* Get Started */}
        <section className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] rounded-xl p-8 shadow-lg border border-gray-800">
          <div className="flex items-center mb-6">
            <FiGift className="text-[#ffa500] w-8 h-8 mr-3" />
            <h2 className="text-3xl font-semibold text-[#ffa500]">Ready to get started?</h2>
          </div>
          
          <div className="bg-black bg-opacity-30 rounded-xl p-6 border border-gray-800">
            <ol className="space-y-5">
              <li className="flex items-center">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#ffa500] bg-opacity-20 flex items-center justify-center text-[#ffa500] font-bold mr-4">1</span>
                <p className="text-gray-200 text-lg">Connect your BSV wallet</p>
              </li>
              <li className="flex items-center">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#ffa500] bg-opacity-20 flex items-center justify-center text-[#ffa500] font-bold mr-4">2</span>
                <p className="text-gray-200 text-lg">Browse posts and find content you love</p>
              </li>
              <li className="flex items-center">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#ffa500] bg-opacity-20 flex items-center justify-center text-[#ffa500] font-bold mr-4">3</span>
                <p className="text-gray-200 text-lg">Lock some BSV to show your appreciation</p>
              </li>
              <li className="flex items-center">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#ffa500] bg-opacity-20 flex items-center justify-center text-[#ffa500] font-bold mr-4">4</span>
                <p className="text-gray-200 text-lg">Create your own content and earn rewards</p>
              </li>
            </ol>
          </div>
          
          <div className="mt-8 text-center">
            <a href="/" className="inline-block bg-gradient-to-r from-[#00ffa3] to-[#00ffff] text-gray-900 font-bold py-3 px-8 rounded-lg text-lg hover:opacity-90 transition-opacity">
              Start Exploring
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
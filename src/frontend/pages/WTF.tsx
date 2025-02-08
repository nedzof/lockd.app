import * as React from 'react';
import { FiLock, FiZap, FiTrendingUp, FiGift } from 'react-icons/fi';

export default function WTF() {
  return (
    <div className="max-w-4xl mx-auto py-12">
      <h1 className="text-4xl font-bold text-white mb-8">WTF is Lockd.app? 🤔</h1>
      
      <div className="space-y-12">
        {/* What is it? */}
        <section className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] rounded-lg p-8">
          <h2 className="text-2xl font-semibold text-[#00ffa3] mb-4">What is it?</h2>
          <p className="text-gray-300 leading-relaxed mb-6">
            Lockd.app is a social platform where you can lock BSV (Bitcoin SV) tokens to show appreciation for content. 
            Think of it as "putting your money where your mouth is" - instead of just liking a post, you temporarily 
            lock some BSV to show real value.
          </p>
        </section>

        {/* How does it work? */}
        <section className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] rounded-lg p-8">
          <h2 className="text-2xl font-semibold text-[#ff00ff] mb-4">How does it work?</h2>
          <div className="space-y-6">
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-[#ff00ff] bg-opacity-10 rounded-lg mt-1">
                <FiLock className="text-[#ff00ff] w-6 h-6" />
              </div>
              <div>
                <h3 className="text-white font-medium mb-2">Lock your BSV</h3>
                <p className="text-gray-300 leading-relaxed">
                  When you see content you love, you can lock some BSV for a period of time. This BSV isn't spent - 
                  it's just temporarily locked and will return to you after the lock period.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="p-3 bg-[#00ffa3] bg-opacity-10 rounded-lg mt-1">
                <FiZap className="text-[#00ffa3] w-6 h-6" />
              </div>
              <div>
                <h3 className="text-white font-medium mb-2">Boost Content</h3>
                <p className="text-gray-300 leading-relaxed">
                  The more BSV locked on a post, the more visibility it gets. This creates a genuine value-based 
                  ranking system where the best content rises to the top.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="p-3 bg-[#00ffff] bg-opacity-10 rounded-lg mt-1">
                <FiTrendingUp className="text-[#00ffff] w-6 h-6" />
              </div>
              <div>
                <h3 className="text-white font-medium mb-2">Earn Rewards</h3>
                <p className="text-gray-300 leading-relaxed">
                  Content creators can earn rewards when their posts accumulate locked BSV. The more value you create, 
                  the more you can earn.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Why use it? */}
        <section className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] rounded-lg p-8">
          <h2 className="text-2xl font-semibold text-[#00ffff] mb-4">Why use it?</h2>
          <div className="space-y-4">
            <p className="text-gray-300 leading-relaxed">
              🎯 <span className="text-white font-medium">Real Value:</span> Your appreciation has actual weight behind it
            </p>
            <p className="text-gray-300 leading-relaxed">
              💎 <span className="text-white font-medium">Quality Content:</span> Content is ranked by actual value, not just clicks
            </p>
            <p className="text-gray-300 leading-relaxed">
              🌱 <span className="text-white font-medium">Support Creators:</span> Help creators earn from their work
            </p>
            <p className="text-gray-300 leading-relaxed">
              🔒 <span className="text-white font-medium">Safe:</span> Your BSV is never at risk - it's just temporarily locked
            </p>
          </div>
        </section>

        {/* Get Started */}
        <section className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] rounded-lg p-8">
          <h2 className="text-2xl font-semibold text-[#ffa500] mb-4">Ready to get started?</h2>
          <div className="space-y-4">
            <p className="text-gray-300 leading-relaxed">
              1. Connect your BSV wallet
            </p>
            <p className="text-gray-300 leading-relaxed">
              2. Browse posts and find content you love
            </p>
            <p className="text-gray-300 leading-relaxed">
              3. Lock some BSV to show your appreciation
            </p>
            <p className="text-gray-300 leading-relaxed">
              4. Create your own content and earn rewards
            </p>
          </div>
        </section>
      </div>
    </div>
  );
} 
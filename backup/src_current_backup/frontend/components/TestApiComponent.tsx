import React, { useEffect, useState } from 'react';

// Simple component to test API connectivity
const TestApiComponent: React.FC = () => {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const API_URL = 'http://localhost:3003';
        console.log('TEST: Using API URL:', API_URL);
        
        const response = await fetch(`${API_URL}/api/posts?limit=5`);
        console.log('TEST: Response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('TEST: API response data:', data);
        
        // Log the content of the first post for debugging
        if (data.posts && data.posts.length > 0) {
          console.log('TEST: First post content details:', {
            id: data.posts[0].id,
            content: data.posts[0].content,
            contentLength: data.posts[0].content ? data.posts[0].content.length : 0,
            content_type: typeof data.posts[0].content,
            isVote: data.posts[0].is_vote,
            hasvote_options: data.posts[0].vote_options && data.posts[0].vote_options.length > 0
          });
        }
        
        if (data.posts && Array.isArray(data.posts)) {
          setPosts(data.posts);
        } else {
          throw new Error('Invalid response format');
        }
      } catch (err) {
        console.error('TEST: Error fetching posts:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    
    fetchPosts();
  }, []);
  
  return (
    <div className="p-4 bg-gray-800 text-white rounded-lg">
      <h2 className="text-xl mb-4">API Test Component</h2>
      
      {loading && <p>Loading posts...</p>}
      
      {error && (
        <div className="bg-red-500 p-2 rounded mb-4">
          <p>Error: {error}</p>
        </div>
      )}
      
      {!loading && !error && (
        <div>
          <p>Found {posts.length} posts</p>
          
          {posts.length > 0 && (
            <div className="mt-4">
              <h3 className="text-lg mb-2">First Post Raw Data:</h3>
              <pre className="bg-gray-900 p-2 rounded overflow-auto text-xs" style={{ maxHeight: '200px' }}>
                {JSON.stringify(posts[0], null, 2)}
              </pre>
            </div>
          )}
          
          <ul className="mt-4 space-y-4">
            {posts.map(post => (
              <li key={post.id} className="border border-gray-700 p-3 rounded">
                <p><strong>ID:</strong> {post.id}</p>
                <div className="mt-1">
                  <strong>Content:</strong> 
                  <div className="whitespace-pre-wrap mt-1 bg-gray-900 p-2 rounded text-white">
                    {post.content || "No content available"}
                  </div>
                </div>
                <p className="mt-1"><strong>Created:</strong> {new Date(post.created_at).toLocaleString()}</p>
                <p className="mt-1"><strong>Has Image:</strong> {post.raw_image_data ? 'Yes' : 'No'}</p>
                
                {post.raw_image_data && (
                  <div className="mt-2">
                    <p><strong>Image Data Type:</strong> {typeof post.raw_image_data}</p>
                    <p><strong>Image Data Length:</strong> {post.raw_image_data.length} chars</p>
                    
                    <div className="mt-2">
                      <p><strong>Image Preview:</strong></p>
                      <img 
                        src={`data:image/jpeg;base64,${post.raw_image_data}`} 
                        alt="Post image" 
                        className="mt-1 max-w-full h-auto rounded"
                        style={{ maxHeight: '200px' }}
                        onError={() => console.error('Failed to load image for post', post.id)}
                      />
                    </div>
                  </div>
                )}
                
                {post.tags && post.tags.length > 0 && (
                  <div className="mt-2">
                    <p><strong>Tags:</strong> {post.tags.join(', ')}</p>
                  </div>
                )}

                {post.is_vote && post.vote_options && post.vote_options.length > 0 && (
                  <div className="mt-3 border-t border-gray-700 pt-2">
                    <p className="font-bold">Vote Options:</p>
                    <ul className="mt-1 space-y-2">
                      {post.vote_options.map(option => (
                        <li key={option.id} className="bg-gray-800 p-2 rounded">
                          <p><strong>Option:</strong> {option.content}</p>
                          <p><strong>Locked Amount:</strong> {option.lock_amount}</p>
                          <p><strong>Lock Duration:</strong> {option.lock_duration} days</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default TestApiComponent;

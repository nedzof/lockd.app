import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Button, 
  Typography, 
  Paper, 
  TextField, 
  CircularProgress, 
  Chip,
  Divider,
  Alert,
  Grid,
  Card,
  CardContent,
  CardActions,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import axios from 'axios';

const API_URL = 'http://localhost:3003';

interface Post {
  id: string;
  content: string;
  tags: string[];
}

interface TaggingResult {
  postId: string;
  previousTags: string[];
  newTags: string[];
  count: number;
}

const PostTagger: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [batchLoading, setBatchLoading] = useState<boolean>(false);
  const [result, setResult] = useState<TaggingResult | null>(null);
  const [error, setError] = useState<string>('');
  const [postId, setPostId] = useState<string>('');
  const [batchResults, setBatchResults] = useState<any[]>([]);

  // Fetch recent posts
  useEffect(() => {
    const fetchRecentPosts = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_URL}/api/posts?limit=10`);
        if (response.data.success) {
          setPosts(response.data.data.posts);
        }
      } catch (err) {
        setError('Failed to fetch recent posts');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentPosts();
  }, []);

  // Generate tags for a specific post
  const generateTagsForPost = async () => {
    if (!postId) {
      setError('Please enter a post ID');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setResult(null);

      const response = await axios.post(`${API_URL}/api/post-tagging/${postId}`);
      
      if (response.data.success) {
        setResult(response.data.data);
      } else {
        setError(response.data.error || 'Failed to generate tags');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'An error occurred while generating tags');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Generate tags for recent posts
  const generateTagsForRecentPosts = async () => {
    try {
      setBatchLoading(true);
      setError('');
      setBatchResults([]);

      const response = await axios.post(`${API_URL}/api/post-tagging/batch/recent`);
      
      if (response.data.success) {
        setBatchResults(response.data.data.details || []);
      } else {
        setError(response.data.error || 'Failed to generate tags for recent posts');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'An error occurred while processing batch');
      console.error(err);
    } finally {
      setBatchLoading(false);
    }
  };

  // Handle post selection
  const handlePostSelect = (post: Post) => {
    setSelectedPost(post);
    setPostId(post.id);
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Post Tagger
      </Typography>
      <Typography variant="body1" paragraph>
        Generate and apply AI-powered tags to posts using our local DeepSeek service.
      </Typography>

      <Divider sx={{ my: 3 }} />

      {/* Single Post Tagging */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h5" gutterBottom>
          Tag a Specific Post
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <TextField
            label="Post ID"
            variant="outlined"
            fullWidth
            value={postId}
            onChange={(e) => setPostId(e.target.value)}
            sx={{ mr: 2 }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={generateTagsForPost}
            disabled={loading || !postId}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            Generate Tags
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {result && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6">Results:</Typography>
            <Typography variant="body2" color="textSecondary">
              Post ID: {result.postId}
            </Typography>
            
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2">Previous Tags ({result.previousTags.length}):</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, my: 1 }}>
                {result.previousTags.length > 0 ? (
                  result.previousTags.map((tag, index) => (
                    <Chip key={index} label={tag} size="small" />
                  ))
                ) : (
                  <Typography variant="body2" color="textSecondary">No previous tags</Typography>
                )}
              </Box>
            </Box>
            
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2">New Tags ({result.newTags.length}):</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, my: 1 }}>
                {result.newTags.map((tag, index) => (
                  <Chip key={index} label={tag} color="primary" size="small" />
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </Paper>

      {/* Recent Posts */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h5" gutterBottom>
              Recent Posts
            </Typography>
            
            {loading && <CircularProgress sx={{ display: 'block', mx: 'auto', my: 2 }} />}
            
            {posts.length > 0 ? (
              <List>
                {posts.map((post) => (
                  <ListItem 
                    key={post.id} 
                    button 
                    onClick={() => handlePostSelect(post)}
                    selected={selectedPost?.id === post.id}
                    divider
                  >
                    <ListItemText
                      primary={post.content.substring(0, 50) + '...'}
                      secondary={
                        <>
                          <Typography variant="caption" component="span">
                            ID: {post.id}
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                            {post.tags.slice(0, 5).map((tag, idx) => (
                              <Chip key={idx} label={tag} size="small" variant="outlined" />
                            ))}
                            {post.tags.length > 5 && (
                              <Chip label={`+${post.tags.length - 5} more`} size="small" variant="outlined" />
                            )}
                          </Box>
                        </>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="textSecondary">
                No posts found
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Batch Processing */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h5" gutterBottom>
              Batch Processing
            </Typography>
            <Typography variant="body2" paragraph>
              Generate tags for recent posts that don't have tags yet.
            </Typography>
            
            <Button
              variant="contained"
              color="secondary"
              onClick={generateTagsForRecentPosts}
              disabled={batchLoading}
              startIcon={batchLoading ? <CircularProgress size={20} /> : null}
              fullWidth
              sx={{ mb: 3 }}
            >
              Process Recent Posts
            </Button>
            
            {batchResults.length > 0 && (
              <Box>
                <Typography variant="subtitle1">
                  Processed {batchResults.length} posts
                </Typography>
                
                <Box sx={{ mt: 2, maxHeight: 300, overflow: 'auto' }}>
                  {batchResults.map((result, index) => (
                    <Card key={index} variant="outlined" sx={{ mb: 1 }}>
                      <CardContent sx={{ py: 1 }}>
                        <Typography variant="caption" color="textSecondary">
                          Post ID: {result.postId}
                        </Typography>
                        <Typography variant="body2">
                          Added {result.tags.length} tags
                        </Typography>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PostTagger;

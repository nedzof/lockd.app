import React, { useState } from 'react';
import axios from 'axios';
import { Box, Button, Chip, CircularProgress, Container, Paper, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';

const API_URL = 'http://localhost:3003/api';

const TagChip = styled(Chip)(({ theme }) => ({
  margin: theme.spacing(0.5),
  fontWeight: 500,
}));

const TagContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexWrap: 'wrap',
  padding: theme.spacing(1),
  marginTop: theme.spacing(2),
  minHeight: '100px',
}));

const TagGenerator: React.FC = () => {
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('');

  const generateTags = async () => {
    if (!content.trim()) {
      setError('Please enter some content');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const response = await axios.post(`${API_URL}/tag-generation`, { content });
      
      if (response.data.success) {
        setTags(response.data.data.tags);
        setMode(response.data.data.mode);
      } else {
        setError(response.data.message || 'Failed to generate tags');
      }
    } catch (err) {
      setError('Error connecting to the server. Please try again later.');
      console.error('Tag generation error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        AI Tag Generator
      </Typography>
      
      <Typography variant="subtitle1" align="center" color="textSecondary" paragraph>
        Generate relevant tags for your content using our local AI-powered system
      </Typography>
      
      <Paper elevation={3} sx={{ p: 3, mt: 4 }}>
        <TextField
          label="Content"
          multiline
          rows={6}
          fullWidth
          variant="outlined"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Enter article content, blog post, or any text to generate tags..."
          disabled={loading}
        />
        
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={generateTags}
            disabled={loading || !content.trim()}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Generate Tags'}
          </Button>
          
          {mode && (
            <Typography variant="body2" color="textSecondary">
              Mode: <strong>{mode === 'fallback' ? 'Keyword Extraction' : 'AI Model'}</strong>
            </Typography>
          )}
        </Box>
        
        {error && (
          <Typography color="error" sx={{ mt: 2 }}>
            {error}
          </Typography>
        )}
        
        {tags.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Generated Tags ({tags.length}):
            </Typography>
            
            <TagContainer>
              {tags.map((tag, index) => (
                <TagChip key={index} label={tag} color="primary" variant="outlined" />
              ))}
            </TagContainer>
          </Box>
        )}
      </Paper>
      
      <Box sx={{ mt: 6, textAlign: 'center' }}>
        <Typography variant="body2" color="textSecondary">
          This system uses a local AI approach with DeepSeek V3 for tag generation.
          When the AI model is not available, it falls back to a keyword extraction algorithm.
        </Typography>
      </Box>
    </Container>
  );
};

export default TagGenerator;

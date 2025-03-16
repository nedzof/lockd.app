import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  Chip, 
  Paper, 
  Grid, 
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Alert
} from '@mui/material';
import axios from 'axios';

const API_URL = 'http://localhost:3003';

interface Tag {
  id: string;
  name: string;
  count: number;
  type: string;
  created_at: string;
}

const TagGenerator: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [generatedTags, setGeneratedTags] = useState<string[]>([]);
  const [popularTags, setPopularTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagType, setTagType] = useState('ai');
  const [maxTags, setMaxTags] = useState(30);

  useEffect(() => {
    // Fetch popular tags when component mounts
    fetchPopularTags();
  }, []);

  const fetchPopularTags = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/post-tagging/popular`);
      setPopularTags(response.data);
    } catch (err) {
      console.error('Error fetching popular tags:', err);
      setError('Failed to fetch popular tags. Please try again later.');
    }
  };

  const handleGenerateTags = async () => {
    if (!inputText.trim()) {
      setError('Please enter some text to generate tags.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${API_URL}/api/post-tagging/generate`, {
        content: inputText,
        type: tagType,
        maxTags: maxTags
      });

      setGeneratedTags(response.data.tags || []);
    } catch (err) {
      console.error('Error generating tags:', err);
      setError('Failed to generate tags. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTagTypeChange = (event: SelectChangeEvent) => {
    setTagType(event.target.value);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h5" gutterBottom>
              Generate Tags
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Enter text content to generate relevant tags using our local AI system.
            </Typography>

            <TextField
              label="Content for Tag Generation"
              multiline
              rows={6}
              fullWidth
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              variant="outlined"
              placeholder="Enter text content here..."
              sx={{ mb: 3 }}
            />

            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
              <FormControl sx={{ minWidth: 150 }}>
                <InputLabel id="tag-type-label">Tag Type</InputLabel>
                <Select
                  labelId="tag-type-label"
                  value={tagType}
                  label="Tag Type"
                  onChange={handleTagTypeChange}
                >
                  <MenuItem value="ai">AI Generated</MenuItem>
                  <MenuItem value="keyword">Keyword Based</MenuItem>
                  <MenuItem value="manual">Manual</MenuItem>
                </Select>
              </FormControl>

              <TextField
                type="number"
                label="Max Tags"
                value={maxTags}
                onChange={(e) => setMaxTags(Number(e.target.value))}
                InputProps={{ inputProps: { min: 1, max: 50 } }}
                sx={{ width: 120 }}
              />

              <Button
                variant="contained"
                color="primary"
                onClick={handleGenerateTags}
                disabled={isLoading || !inputText.trim()}
                sx={{ ml: 'auto' }}
              >
                {isLoading ? <CircularProgress size={24} /> : 'Generate Tags'}
              </Button>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                Generated Tags ({generatedTags.length})
              </Typography>
              <Paper 
                variant="outlined" 
                sx={{ 
                  p: 2, 
                  minHeight: '100px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 1
                }}
              >
                {generatedTags.length > 0 ? (
                  generatedTags.map((tag, index) => (
                    <Chip 
                      key={index} 
                      label={tag} 
                      color="primary" 
                      variant="outlined"
                    />
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ width: '100%', textAlign: 'center', mt: 2 }}>
                    {isLoading ? 'Generating tags...' : 'No tags generated yet. Enter some text and click "Generate Tags".'}
                  </Typography>
                )}
              </Paper>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
              Popular Tags
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Most frequently used tags in the system.
            </Typography>
            
            <Divider sx={{ mb: 2 }} />
            
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {popularTags.length > 0 ? (
                popularTags.map((tag) => (
                  <Chip 
                    key={tag.id} 
                    label={`${tag.name} (${tag.count})`}
                    color="secondary"
                    variant="outlined"
                    size="small"
                  />
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No popular tags available yet.
                </Typography>
              )}
            </Box>
            
            <Button 
              variant="text" 
              color="primary" 
              onClick={fetchPopularTags}
              sx={{ mt: 2 }}
              size="small"
            >
              Refresh
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default TagGenerator;

import React from 'react';
import { Box, Container, Typography, Link } from '@mui/material';
import TagGenerator from '../components/TagGenerator';

const TagGeneratorPage: React.FC = () => {
  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Lockd.app Tag Generation System
        </Typography>
        
        <Typography variant="subtitle1" align="center" color="textSecondary" paragraph>
          Generate relevant tags for your content using our local AI-powered system
        </Typography>
        
        <TagGenerator />
        
        <Box sx={{ mt: 6, textAlign: 'center' }}>
          <Typography variant="body2" color="textSecondary">
            This system uses a local AI approach with DeepSeek V3 for tag generation.
            When the AI model is not available, it falls back to a keyword extraction algorithm.
          </Typography>
          
          <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
            <Link href="/docs/tag-generation-api.md" target="_blank" rel="noopener">
              View API Documentation
            </Link>
          </Typography>
        </Box>
      </Box>
    </Container>
  );
};

export default TagGeneratorPage;

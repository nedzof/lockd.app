import * as React from 'react';
import { HODLTransaction } from '../types';
import PostPlaceholder from './placeholders/PostPlaceholder';
import ImagePlaceholder from './placeholders/ImagePlaceholder';
import VoteOptionsDisplay from './VoteOptionsDisplay';

interface PostContentProps {
  transaction: HODLTransaction;
}

function formatNote(note: string, search: string | null) {
  // Add your note formatting logic here
  return note;
}

function containsTwitterLink(note: string) {
  return note.includes('twitter.com') || note.includes('x.com');
}

function containsSpotifyLink(note: string) {
  return note.includes('open.spotify.com');
}

export default function PostContent({ transaction }: PostContentProps) {
  const [isLoading, setIsLoading] = React.useState(true);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [imageLoading, setImageLoading] = React.useState(true);
  const [note, setNote] = React.useState(transaction.content);
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    setIsLoading(false);

    // Process raw image data if available
    if (transaction.raw_image_data) {
      try {
        // Debug: Check the format of raw_image_data
        console.log('PostContent - Raw image data format check:', {
          txid: transaction.txid,
          dataLength: transaction.raw_image_data.length,
          firstChars: transaction.raw_image_data.substring(0, 30)
        });
        
        // Handle different possible formats of raw_image_data
        if (transaction.raw_image_data.startsWith('data:')) {
          // Already a data URL
          setImageUrl(transaction.raw_image_data);
        } else if (transaction.raw_image_data.startsWith('/9j/') || 
                   transaction.raw_image_data.startsWith('iVBOR') || 
                   /^[A-Za-z0-9+/=]+$/.test(transaction.raw_image_data.substring(0, 20))) {
          // Looks like base64 without data URL prefix
          const mediaType = transaction.media_type || 'image/jpeg';
          setImageUrl(`data:${mediaType};base64,${transaction.raw_image_data}`);
        } else {
          // Try UTF-8 encoded string approach
          try {
            // Try to parse as JSON in case it's stored as a JSON string
            const parsedData = JSON.parse(transaction.raw_image_data);
            if (typeof parsedData === 'string') {
              if (parsedData.startsWith('data:')) {
                setImageUrl(parsedData);
              } else {
                setImageUrl(`data:${transaction.media_type || 'image/jpeg'};base64,${parsedData}`);
              }
            }
          } catch (parseError) {
            // Not JSON, try original approach with Buffer
            try {
              // Try standard base64 decoding
              const blob = new Blob([Buffer.from(transaction.raw_image_data, 'base64')], { 
                type: transaction.media_type || 'image/jpeg' 
              });
              setImageUrl(URL.createObjectURL(blob));
            } catch (bufferError) {
              console.error('Buffer approach failed:', bufferError);
              
              // Last resort: try treating it as binary data directly
              try {
                const byteArray = new Uint8Array(transaction.raw_image_data.length);
                for (let i = 0; i < transaction.raw_image_data.length; i++) {
                  byteArray[i] = transaction.raw_image_data.charCodeAt(i);
                }
                const blob = new Blob([byteArray], { type: transaction.media_type || 'image/jpeg' });
                setImageUrl(URL.createObjectURL(blob));
              } catch (binaryError) {
                console.error('Binary approach failed:', binaryError);
              }
            }
          }
        }
      } catch (e) {
        console.error('Failed to process raw image data for transaction:', transaction.txid, e);
      }
    }

    // Cleanup function to revoke object URL when component unmounts
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [transaction.txid, transaction.raw_image_data]);

  const toggleExpansion = () => setIsExpanded(!isExpanded);

  if (isLoading) {
    return <PostPlaceholder />;
  }

  const hasImage = !!transaction.media_url || !!imageUrl;
  const content = hasImage ? transaction.description || note : note;

  return (
    <div className="space-y-4">
      {/* Image (if present) */}
      {hasImage && (
        <div className="relative">
          {imageLoading && <ImagePlaceholder />}
          <img
            src={transaction.media_url || imageUrl || ''}
            alt={transaction.description || 'Post image'}
            className={`w-full h-auto rounded-lg object-cover ${imageLoading ? 'hidden' : ''}`}
            onLoad={() => setImageLoading(false)}
            onError={() => setImageLoading(false)}
          />
          {transaction.media_type && (
            <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
              {transaction.media_type.split('/')[1].toUpperCase()}
            </div>
          )}
        </div>
      )}

      {/* Text Content */}
      <div className="space-y-2">
        {/* Main content */}
        {content.length > 280 && !isExpanded ? (
          <div dangerouslySetInnerHTML={{ __html: formatNote(content.slice(0, 280), null) + "..." }}></div>
        ) : (
          containsTwitterLink(content) ? (
            <>
              <div dangerouslySetInnerHTML={{ __html: formatNote(content, null) }} />
              {/* Add Twitter embed component here */}
            </>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: formatNote(content, null) }} />
          )
        )}

        {/* Expand/Collapse button */}
        {content.length > 280 && (
          <div className="flex justify-end pr-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpansion();
              }}
              className="text-black-400 dark:text-white hover:text-orange-400 text-sm pl-2 pb-1"
            >
              {isExpanded ? (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 15L12 9L6 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          </div>
        )}

        {/* Spotify embed */}
        {containsSpotifyLink(content) && (
          <div className="mt-4">Spotify Embed</div>
        )}
      </div>

      {/* Vote Options (if present) */}
      {transaction.is_vote && (
        <VoteOptionsDisplay transaction={transaction} />
      )}
    </div>
  );
} 
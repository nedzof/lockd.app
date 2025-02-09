import * as React from 'react';
import { HODLTransaction } from '../types';
import PostPlaceholder from './placeholders/PostPlaceholder';
import ImagePlaceholder from './placeholders/ImagePlaceholder';

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

  React.useEffect(() => {
    setIsLoading(false);
  }, [transaction.txid]);

  const toggleExpansion = () => setIsExpanded(!isExpanded);

  if (isLoading) {
    return <PostPlaceholder />;
  }

  const isImagePost = !!transaction.media_url;
  const content = isImagePost ? transaction.description || note : note;

  return (
    <div className="space-y-4">
      {/* Image (if present) */}
      {isImagePost && (
        <div className="relative">
          {imageLoading && <ImagePlaceholder />}
          <img
            src={transaction.media_url}
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
    </div>
  );
} 
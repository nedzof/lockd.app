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
  const [imageLoading, setImageLoading] = React.useState(false);
  const [note, setNote] = React.useState(transaction.content);

  React.useEffect(() => {
    setIsLoading(false);
  }, [transaction.txid]);

  const toggleExpansion = () => setIsExpanded(!isExpanded);

  if (isLoading) {
    return <PostPlaceholder />;
  }

  return (
    <>
      {note.length > 280 && !isExpanded ? (
        <div dangerouslySetInnerHTML={{ __html: formatNote(note.slice(0, 280), null) + "..." }}></div>
      ) : (
        containsTwitterLink(note) ? (
          <>
            <div dangerouslySetInnerHTML={{ __html: formatNote(note, null) }} />
            {/* Add Twitter embed component here */}
          </>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: formatNote(note, null) }} />
        )
      )}

      {note.length > 280 && (
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

      {containsSpotifyLink(note) && (
        // Add Spotify embed component here
        <div className="mt-4">Spotify Embed</div>
      )}

      {imageLoading ? (
        <ImagePlaceholder />
      ) : (
        transaction.media_url && (
          <img
            src={transaction.media_url}
            alt="Post media"
            className="mb-1 rounded-lg w-full h-auto"
            onLoad={() => setImageLoading(false)}
          />
        )
      )}
    </>
  );
} 
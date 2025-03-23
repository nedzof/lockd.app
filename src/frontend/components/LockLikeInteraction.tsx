import React from 'react';
import { LockLike } from '../types';
import UnifiedLockInteraction from './UnifiedLockInteraction';

interface LockLikeInteractionProps {
  posttx_id?: string;
  replytx_id?: string;
  postLockLike: (
    tx_id: string,
    amount: number,
    nLockTime: number,
    handle: string,
    posttx_id?: string,
    replytx_id?: string
  ) => Promise<LockLike>;
}

export default function LockLikeInteraction({ posttx_id, replytx_id, postLockLike }: LockLikeInteractionProps) {
  return (
    <UnifiedLockInteraction
      id={posttx_id || replytx_id || ''}
      type="like"
      modalTitle="Lock BSV"
      buttonStyle="icon"
      posttx_id={posttx_id}
      replytx_id={replytx_id}
      postLockLike={postLockLike}
    />
  );
} 
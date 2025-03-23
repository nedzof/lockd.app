# Lockd.app Bug Report

## Authentication & Wallet Issues

### 1. Wallet Balance Detection Failure on Locking
**Description**:  
- Persistent "Checking wallet balance..." message regardless of connection state
- No proper state handling for unconnected wallets

**Fixed**
**Resolution**: Implemented proper wallet connection state handling with appropriate user feedback

**Expected Behavior**:  
- Clear wallet connection prompt when unconnected
- Balance check timeout with user feedback

**Affected States**:
- Both connected and unconnected wallet states

---

## UI/UX Issues

### 2. Modal Interaction Problems
**Description**:  
- Can't use Enter/Esc in locking modal
- Keyboard navigation not functional

**Fixed**
**Resolution**: Added keyboard support - Enter to confirm and Esc to cancel in modals

**Reproduction Steps**:  
1. Initiate locking process
2. Try using Enter/Esc keys

---

### 3. Post Display Limitations
**Description**:  
- Only wallet owner's posts visible when connected
- No public/unrelated posts displayed

**Expected Behavior**:  
- Show all relevant posts regardless of ownership

---

### 4. Post Creation State Persistence
**Description**:  
- "Creating post..." status remains after wallet cancellation
- No cleanup after modal exit
- Ghost status messages persist

**Reproduction Steps**:
1. Initiate post creation
2. Cancel in wallet interface
3. Close creation modal

**Expected Behavior**:
- Immediate status clearance on cancellation
- Automatic state reset on modal close
- Timeout fallback (5-10s)

---

## Media Handling Issues

### 5. Image Loading Failures
**Description**:  
- "Image could not be loaded" error during searches
- Media endpoints returning 500 errors

**Console Errors**:
```bash
GET /api/posts/66a54075-8d0a-450a-b8f9-9f9a3e220202/media 500 (Internal Server Error)
GET /api/posts/66a54075-8d0a-450a-b8f9-9f9a3e220202/media?retry=1742414327075 500
```

### 6. GIF Rendering Issues
**Description**:  
- GIFs display as static images
- No animation playback functionality
- Potential inscription/data processing issues

**Expected Behavior**:  
- Proper animated GIF support
- Fallback to static image if animation unavailable
- Clear format indication (GIF badge)

**Investigation Needed**:
1. Media type detection in inscription pipeline
2. Frontend rendering implementation
3. Data storage format validation

---

## Database Errors

### 7. Prisma ORM Validation Error
**Error Context**:  
Occurs in `posts.ts` media handler during post lookup

<details>
<summary>Full error details</summary>

```javascript
// posts.ts:698:36
const post = await prisma.post.findUnique({
  where: { id: "66a54075-8d0a-450a-b8f9-9f9a3e220202" },
  select: {
    media_type: true,
    raw_image_data: true,
    imageFormat: true,  // Invalid field
    ~~~~~~~~~~~
    // Available fields:
    id?: true,
    content?: true,
    tx_id?: true,
    // ... other valid fields
  }
})
```

**Terminal Output**:
```json
{
  "clientVersion": "5.22.0",
  "name": "PrismaClientValidationError",
  "message": "Unknown field `imageFormat` for select statement on model `post`",
  "stack": "...",
  "timestamp": "2025-03-19T19:58:47.078Z"
}
```
</details>

---

## Statistics & Analytics Issues

### 8. Stats Navigation Lock
**Description**:  
- No exit mechanism in stats banner
- Forced page back navigation required

**Expected Behavior**:  
- Clear close button/X icon in header
- Persistent navigation in view

---

### 9. Temporal Display Inconsistencies
**Description**:  
**Chart Axis Issues**:
- Reverse chronological order (current day first)
- 24h display shows monthly data
- Monthly display shows daily data
- All-time range improperly scaled

**Data Display Mismatches**:
| Display Mode | Shows Data For |
|--------------|----------------|
| 24 Hours     | Monthly        |
| Monthly      | Daily          | 
| All-Time     | Unclear range  |

**Expected Behavior**:
```text
24h   → Hourly buckets (last 24h)
Month → Daily aggregates (last 30d)
All   → Monthly aggregates (all history)
```

---

### 10. Chart Rendering Performance
**Description**:  
- Full page reload on display swap
- Laggy UI interactions

**Improvement Suggestions**:
- Client-side filtering without reload
- Virtualized chart rendering
- Dedicated Web Worker for data processing

---

### 11. Time Filter Limitations
**Description**:  
- All-time tracked metrics not available in time filters
- Historical data gaps in filtered views

**Affected Tables**:
1. Lock Activity Trend
2. Value Locked Trend  
3. Platform Activity

**Expected Behavior**:
- Time filters show all available metrics
- Clear indicator of data coverage
- Auto-scaling date ranges

<details>
<summary>Suggested Data Structure Improvements</summary>

```typescript
interface StatsData {
  timeframe: '24h' | '7d' | '30d' | 'all';
  resolution: 'hourly' | 'daily' | 'monthly';
  dataPoints: {
    timestamp: Date;
    locks: number;
    value: number;
    activity: number;
  }[];
  metadata: {
    firstLockEver: Date;
    autoScaled: boolean;
  };
}
```
</details>

---

## Missing Features

### 12. User Lock Tracking (NEEDS IMPLEMENTATION)
**Description**:  
- No functionality to track individual user lock activities
- Unable to monitor historical lock data per wallet

**Required Functionality**:
- Track lock events by user wallet address
- Store timestamp, duration, and value data
- Provide API endpoints for retrieving user-specific lock history
- Implement UI components to display personalized lock statistics

**Technical Specifications**:
- Database schema needs user_id/wallet_address field in locks table
- API endpoint for `/api/users/:address/locks`
- Dashboard component for user lock history visualization
- Filtering capabilities (time range, lock value, status)

**Priority**: High
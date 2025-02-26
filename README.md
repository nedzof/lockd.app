# Lockd.app

A decentralized social platform for BSV ordinals.

## Features

- Image ordinal inscriptions
- Real-time transaction monitoring using JungleBus
- Supabase database integration
- React frontend with Vite
- Dynamic tag generation from current events

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```
Then edit `.env` with your Supabase credentials.

3. Set up the database:
```bash
npm run setup-db
```

4. Set up API keys for dynamic tag generation:
   - Get a free API key from [GNews](https://gnews.io/)
   - Get a free API key from [NewsData.io](https://newsdata.io/)
   - Add these keys to your `.env` file:
   ```
   GNEWS_API_KEY="your_gnews_api_key"
   NEWSDATA_API_KEY="your_newsdata_api_key"
   ```

## Development

Run the frontend development server:
```bash
npm run dev
```

Run the JungleBus transaction monitor in development mode:
```bash
npm run dev:junglebus
```

Generate tags manually:
```bash
npm run generate-tags
```

## Dynamic Tag Generation

The platform automatically generates trending tags from current news events. This system:

- Fetches news from multiple APIs (GNews and NewsData.io)
- Uses natural language processing to extract relevant keywords and entities
- Stores tags in the database with usage tracking
- Automatically refreshes tags every 6 hours
- Provides API endpoints for tag management

Tag endpoints:
- `GET /api/tags` - Get all available tags (prioritizes current event tags)
- `GET /api/tags/current-events` - Get only current event tags
- `GET /api/tags/all` - Get all tags with metadata
- `POST /api/tags/generate` - Manually trigger tag generation
- `PUT /api/tags/:id` - Update a tag
- `DELETE /api/tags/:id` - Delete a tag
- `POST /api/tags/usage/:name` - Increment tag usage count

## Tag Management

The platform includes a comprehensive tag management system:

- **Admin Interface**: Access at `/admin/tags` (requires wallet connection)
- **Tag Types**: 
  - Current Event Tags: Automatically generated from news
  - User Created Tags: Created when users add new tags to posts
- **Features**:
  - View all tags with usage statistics
  - Edit tag names
  - Delete tags
  - Manually trigger tag generation
  - Track tag popularity through usage count

## Production

Build the frontend:
```bash
npm run build
```

Build and run the JungleBus monitor:
```bash
npm run build:junglebus
npm run start:junglebus
```

## JungleBus Transaction Monitor

The JungleBus monitor listens for:
- Ordinal inscriptions with image content (JPEG, PNG, GIF, WebP, SVG)
- Standard BSV transactions

Configuration is in `src/services/scanner/junglebus.types.ts`. 
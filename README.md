# Lockd.app

A decentralized social platform for BSV ordinals.

## Features

- Image ordinal inscriptions
- Real-time transaction monitoring using JungleBus
- Supabase database integration
- React frontend with Vite

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

## Development

Run the frontend development server:
```bash
npm run dev
```

Run the JungleBus transaction monitor in development mode:
```bash
npm run dev:junglebus
```

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
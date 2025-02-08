# Lockd.app - BSV Time-Locked Transactions

A decentralized application for creating time-locked BSV transactions with Telegram bot integration.

## Features

- Create time-locked BSV transactions
- Monitor lock status and transaction confirmations
- Real-time updates via Pusher
- Telegram bot integration
- Comprehensive error handling
- Block height-based timelock functionality
- Complete wallet integration with Yours wallet
- Transaction monitoring and status tracking
- User-friendly UI components

## Architecture

- **Smart Contract**: BSV locking contract with timelock functionality
- **Backend**: Node.js/Express with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Real-time Updates**: Pusher
- **Wallet Integration**: Yours Wallet SDK
- **Frontend**: React with TypeScript
- **API**: RESTful endpoints for web and Telegram bot

## API Endpoints

### Telegram Bot API

1. Get User's Locks
```
GET /api/telegram/locks/:userId
```

2. Get Lock Details
```
GET /api/telegram/lock/:lockId
```

3. Create New Lock
```
POST /api/telegram/lock
Body: {
  creatorId: string,
  recipientAddress: string,
  amount: number,
  lockPeriodDays: number
}
```

4. Get Lock Status
```
GET /api/telegram/lock/:lockId/status
```

5. Get Transaction Status
```
GET /api/telegram/transaction/:txId/status
```

6. Get User Statistics
```
GET /api/telegram/user/:userId/stats
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

3. Set up the database:
```bash
npx prisma migrate dev
```

4. Start the development server:
```bash
npm run dev
```

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `PUSHER_APP_ID`: Pusher app ID
- `PUSHER_KEY`: Pusher key
- `PUSHER_SECRET`: Pusher secret
- `PUSHER_CLUSTER`: Pusher cluster
- `NEXT_PUBLIC_PUSHER_KEY`: Public Pusher key
- `NEXT_PUBLIC_PUSHER_CLUSTER`: Public Pusher cluster

## Security Features

- Address validation
- Amount validation
- Signature verification
- Public key validation
- Block height validation
- Transaction validation
- Rate limiting
- Error handling

## Error Handling

- Custom error classes for different scenarios
- User-friendly error messages
- Comprehensive error codes
- Transaction failure handling
- API error handling

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 
# Synx Connect - Shopify CSV Feed Importer

Enterprise-grade Shopify app for automating product imports from FTP/SFTP CSV feeds with full metafield support.

## 🚀 Features

- **Automated CSV Import**: Fetch product data from FTP/SFTP servers
- **Smart Sync**: Diff-based updates to minimize API calls
- **Metafield Support**: First-class support for custom metafields
- **Scheduling**: Automated sync with cron-based scheduling
- **Activity Logs**: Comprehensive logging with row-level details
- **Preview Mode**: Simulate sync before execution
- **Secure**: Encrypted credential storage

## 📋 Prerequisites

- Node.js >= 18.0.0
- MongoDB >= 6.0
- Redis >= 6.0
- Shopify Partner Account

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Synx-Connect
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start MongoDB and Redis**
   ```bash
   # MongoDB
   mongod --dbpath /path/to/data

   # Redis
   redis-server
   ```

5. **Run the application**
   ```bash
   # Development mode (server + client)
   npm run dev

   # Run queue worker (separate terminal)
   npm run worker:dev

   # Run scheduler (separate terminal)
   npm run scheduler:dev
   ```

## 🏗️ Project Structure

```
synx-connect/
├── server/
│   ├── config/          # Configuration files
│   ├── models/          # MongoDB schemas
│   ├── controllers/     # Route controllers
│   ├── services/        # Business logic
│   │   ├── ftp/         # FTP/SFTP connectors
│   │   ├── csv/         # CSV parsing
│   │   ├── mapping/     # Field mapping engine
│   │   ├── sync/        # Shopify sync engine
│   │   └── diff/        # Change detection
│   ├── workers/         # Queue workers & scheduler
│   ├── middleware/      # Express middleware
│   ├── routes/          # API routes
│   └── utils/           # Utility functions
├── client/              # React frontend (Polaris)
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   ├── hooks/       # Custom hooks
│   │   └── utils/       # Frontend utilities
│   └── public/
└── temp/                # Temporary file storage
```

## 🔧 Configuration

### Shopify App Setup

1. Create a new app in your Shopify Partner Dashboard
2. Set App URL to your development URL (e.g., `https://localhost:3000`)
3. Configure OAuth redirect URL: `https://localhost:3000/api/auth/callback`
4. Set required scopes: `write_products,read_products`
5. Copy API credentials to `.env`

### MongoDB Setup

Create required indexes:
```bash
npm run db:indexes
```

### Redis Queue

The app uses Bull for job processing. Ensure Redis is running before starting workers.

## 🚦 Running in Production

1. **Build the frontend**
   ```bash
   npm run build
   ```

2. **Start services**
   ```bash
   # Main server
   npm start

   # Queue worker (use process manager like PM2)
   pm2 start npm --name "synx-worker" -- run worker

   # Scheduler
   pm2 start npm --name "synx-scheduler" -- run scheduler
   ```

## 📊 API Documentation

### Authentication
All API requests require Shopify OAuth token.

### Key Endpoints

- `GET /api/feeds` - List all feeds
- `POST /api/feeds` - Create new feed
- `PUT /api/feeds/:id` - Update feed
- `DELETE /api/feeds/:id` - Delete feed
- `POST /api/feeds/:id/process` - Start manual sync
- `POST /api/feeds/:id/preview` - Preview sync
- `GET /api/feeds/:id/logs` - Get activity logs
- `GET /api/ftp-connections` - List FTP connections
- `POST /api/ftp-connections` - Add FTP connection
- `POST /api/ftp-connections/:id/test` - Test connection

## 🔐 Security

- FTP credentials encrypted with AES-256
- Shopify OAuth for authentication
- HTTPS enforced in production
- Rate limiting on API endpoints
- Input validation with Joi

## 📝 License

MIT

## 🤝 Support

For issues and feature requests, please create an issue in the repository.

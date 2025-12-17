# Synx Connect - Development Guide

## 📦 Installation

### Prerequisites
- Node.js >= 18.0.0
- MongoDB >= 6.0
- Redis >= 6.0
- Shopify Partner Account

### 1. Install Dependencies

```powershell
# Install root dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

### 2. Environment Setup

Copy `.env.example` to `.env` and configure:

```powershell
cp .env.example .env
```

**Required Configuration:**
- `SHOPIFY_API_KEY` - From Shopify Partner Dashboard
- `SHOPIFY_API_SECRET` - From Shopify Partner Dashboard
- `SHOPIFY_APP_URL` - Your app URL (e.g., https://localhost:3000)
- `ENCRYPTION_KEY` - Generate a secure 32+ character key
- `SESSION_SECRET` - Generate a secure random string
- `MONGODB_URI` - MongoDB connection string
- `REDIS_HOST` - Redis host (default: localhost)

### 3. Start Services

**Start MongoDB:**
```powershell
# Windows (if installed as service)
net start MongoDB

# Or manually
mongod --dbpath C:\data\db
```

**Start Redis:**
```powershell
# Windows (if installed)
redis-server
```

### 4. Run Application

**Development Mode (recommended):**
```powershell
# Terminal 1: Main server + client
npm run dev

# Terminal 2: Queue worker
npm run worker:dev

# Terminal 3: Scheduler
npm run scheduler:dev
```

**Individual Components:**
```powershell
# Server only
npm run server:dev

# Client only
cd client
npm run dev

# Worker only
npm run worker:dev

# Scheduler only
npm run scheduler:dev
```

## 🏗️ Project Structure

```
synx-connect/
├── server/
│   ├── config/           # App configuration
│   │   ├── app.js       # Main config
│   │   ├── database.js  # MongoDB connection
│   │   ├── redis.js     # Redis connection
│   │   └── shopify.js   # Shopify API setup
│   ├── models/          # Mongoose schemas
│   │   ├── Shop.js
│   │   ├── FtpConnection.js
│   │   ├── Feed.js
│   │   ├── Job.js
│   │   └── JobRow.js
│   ├── routes/          # API endpoints
│   │   ├── auth.js
│   │   ├── feeds.js
│   │   ├── ftp-connections.js
│   │   ├── jobs.js
│   │   └── shops.js
│   ├── services/        # Business logic
│   │   ├── ftp/
│   │   │   └── ftp-service.js
│   │   ├── csv/
│   │   │   └── csv-parser.js
│   │   ├── mapping/
│   │   │   └── mapping-engine.js
│   │   ├── diff/
│   │   │   └── diff-engine.js
│   │   └── sync/
│   │       └── shopify-sync.js
│   ├── workers/         # Background jobs
│   │   ├── feed-queue.js
│   │   ├── queue-worker.js
│   │   └── scheduler.js
│   ├── middleware/      # Express middleware
│   ├── utils/           # Utilities
│   │   ├── logger.js
│   │   └── encryption.js
│   ├── app.js          # Express app setup
│   └── index.js        # Server entry point
├── client/             # React frontend
│   ├── src/
│   │   ├── pages/      # Page components
│   │   ├── components/ # Reusable components
│   │   ├── App.jsx
│   │   ├── Router.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── temp/              # Temporary CSV files
├── logs/              # Application logs
├── package.json
├── .env
└── README.md
```

## 🔑 Shopify App Setup

1. **Create App in Shopify Partner Dashboard**
   - Go to https://partners.shopify.com
   - Create new app
   - Choose "Custom app" or "Public app"

2. **Configure App URLs**
   - App URL: `https://your-domain.com`
   - Allowed redirection URL(s): `https://your-domain.com/api/auth/callback`

3. **Set Scopes**
   Required scopes:
   - `write_products`
   - `read_products`

4. **Copy Credentials**
   - Copy API key to `SHOPIFY_API_KEY`
   - Copy API secret to `SHOPIFY_API_SECRET`

## 🧪 Testing

### Test FTP Connection
```javascript
// Use the UI or API
POST /api/ftp-connections/:id/test
```

### Test CSV Parsing
```javascript
// Preview first 10 rows
POST /api/feeds/:id/preview
```

### Manual Feed Sync
```javascript
// Full sync
POST /api/feeds/:id/process
```

## 📊 Monitoring

### Queue Status
```javascript
GET /api/queue/stats
```

### Job Logs
```javascript
GET /api/jobs/:id/rows
```

### Application Logs
- Located in `logs/` directory
- `combined.log` - All logs
- `error.log` - Errors only

## 🐛 Debugging

**Enable Debug Logging:**
```
LOG_LEVEL=debug
```

**Common Issues:**

1. **MongoDB Connection Failed**
   - Ensure MongoDB is running
   - Check `MONGODB_URI` in `.env`

2. **Redis Connection Failed**
   - Ensure Redis is running
   - Check Redis host/port in `.env`

3. **Shopify OAuth Failed**
   - Verify API credentials
   - Check app URL matches Shopify settings
   - Ensure HTTPS in production

4. **FTP Connection Failed**
   - Test connection manually
   - Verify credentials
   - Check firewall settings

## 🚀 Production Deployment

### 1. Build Client
```powershell
npm run build
```

### 2. Use Process Manager (PM2)
```powershell
pm2 start npm --name "synx-server" -- start
pm2 start npm --name "synx-worker" -- run worker
pm2 start npm --name "synx-scheduler" -- run scheduler
```

### 3. Environment Variables
- Set `NODE_ENV=production`
- Use strong encryption keys
- Enable HTTPS
- Configure MongoDB Atlas
- Use Redis Cloud or managed Redis

### 4. Security Checklist
- [ ] HTTPS enabled
- [ ] Strong encryption key (32+ characters)
- [ ] Secure session secret
- [ ] MongoDB authentication enabled
- [ ] Redis password set
- [ ] Rate limiting configured
- [ ] Input validation enabled

## 📝 API Documentation

### Authentication
All endpoints require `?shop=your-store.myshopify.com` query parameter.

### Key Endpoints

**Feeds:**
- `GET /api/feeds` - List feeds
- `POST /api/feeds` - Create feed
- `GET /api/feeds/:id` - Get feed
- `PUT /api/feeds/:id` - Update feed
- `DELETE /api/feeds/:id` - Delete feed
- `POST /api/feeds/:id/process` - Start sync
- `POST /api/feeds/:id/preview` - Preview sync

**FTP Connections:**
- `GET /api/ftp-connections` - List connections
- `POST /api/ftp-connections` - Create connection
- `POST /api/ftp-connections/:id/test` - Test connection
- `DELETE /api/ftp-connections/:id` - Delete connection

**Jobs:**
- `GET /api/jobs` - List jobs
- `GET /api/jobs/:id` - Get job details
- `GET /api/jobs/:id/rows` - Get row-level logs

## 🤝 Contributing

1. Create feature branch
2. Make changes
3. Test thoroughly
4. Submit pull request

## 📄 License

MIT

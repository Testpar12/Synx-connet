# Vercel Deployment Guide

This guide explains how to deploy the Synx Connect application to Vercel.

## Prerequisites

1. A Vercel account (sign up at https://vercel.com)
2. MongoDB database (MongoDB Atlas recommended)
3. Redis instance (Upstash Redis recommended for serverless)
4. Shopify Partner account with app credentials

## Important Notes

⚠️ **Vercel is a serverless platform**, which means:
- Your Express server runs as serverless functions
- Background workers (queue-worker, scheduler) **cannot run on Vercel**
- You'll need separate services for:
  - Queue processing (use Vercel Cron Jobs or external service)
  - Scheduled tasks (use Vercel Cron Jobs or external service)

## Deployment Steps

### 1. Environment Variables

Add these environment variables in Vercel Dashboard → Settings → Environment Variables:

**Required:**
```
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_APP_URL=https://your-app.vercel.app
ENCRYPTION_KEY=your_32_character_encryption_key_minimum
SESSION_SECRET=your_random_session_secret
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
REDIS_HOST=your-redis-host.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
NODE_ENV=production
```

### 2. Build Configuration

The `vercel.json` file is already configured. It will:
- Build the React client app
- Deploy the Express server as a serverless function
- Route API requests to `/api/*`
- Serve static files from the client build

### 3. Deploy to Vercel

**Option A: Using Vercel CLI**
```bash
npm i -g vercel
vercel
```

**Option B: Using GitHub Integration**
1. Push your code to GitHub
2. Import project in Vercel Dashboard
3. Connect your GitHub repository
4. Vercel will auto-detect the configuration

### 4. Build Settings

Vercel will automatically:
- Run `npm install` in root
- Run `npm run build` (builds client)
- Deploy the `api/` directory as serverless functions
- Serve the `client/dist` directory as static files

## Handling Background Workers

Since Vercel doesn't support long-running processes, you have two options:

### Option 1: Vercel Cron Jobs (Recommended)

Create `api/cron/process-queue.js`:
```javascript
import { processQueue } from '../../server/workers/feed-queue.js';

export default async function handler(req, res) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  await processQueue();
  res.json({ status: 'ok' });
}
```

Then add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/process-queue",
    "schedule": "*/5 * * * *"
  }]
}
```

### Option 2: External Worker Service

Deploy workers separately on:
- Railway
- Render
- Fly.io
- DigitalOcean App Platform

## Troubleshooting

### Issue: "Cannot find module"
- Ensure all dependencies are in `package.json`
- Check that `node_modules` is not in `.gitignore` (Vercel will install)

### Issue: Database connection timeout
- Check MongoDB connection string
- Ensure IP whitelist includes Vercel IPs (0.0.0.0/0 for testing)
- Increase timeout in `server/config/database.js`

### Issue: Redis connection errors
- Use Upstash Redis (serverless-compatible)
- Or use Redis Cloud with proper configuration
- Check REDIS_HOST and REDIS_PASSWORD

### Issue: Function timeout
- Increase `maxDuration` in `vercel.json` (up to 60s on Pro plan)
- Optimize database queries
- Use connection pooling

## File Structure for Vercel

```
.
├── api/
│   └── index.js          # Serverless function handler
├── server/               # Express app code
├── client/               # React app
│   └── dist/            # Built static files (generated)
├── vercel.json          # Vercel configuration
└── package.json
```

## Testing Locally

Test the serverless function locally:
```bash
vercel dev
```

This will:
- Start a local server
- Simulate Vercel's serverless environment
- Hot reload on changes

## Production Checklist

- [ ] All environment variables set in Vercel
- [ ] MongoDB connection string configured
- [ ] Redis connection configured (Upstash recommended)
- [ ] Shopify app URLs updated to Vercel domain
- [ ] Client app built successfully
- [ ] API routes tested
- [ ] Background workers configured (external or cron)
- [ ] Error logging configured
- [ ] CORS settings updated for production domain

## Support

For issues specific to Vercel deployment, check:
- Vercel Documentation: https://vercel.com/docs
- Vercel Community: https://github.com/vercel/vercel/discussions


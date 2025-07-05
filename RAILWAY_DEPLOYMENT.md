# Railway Deployment Guide

## Environment Variables Required

Make sure to set these environment variables in your Railway project:

- `PORT` - Railway will set this automatically
- `NODE_ENV` - Set to `production`
- `FRONTEND_URL` - Your Vercel frontend URL (e.g., `https://your-app.vercel.app`)

## Deployment Steps

1. Connect your GitHub repository to Railway
2. Set the environment variables above
3. Deploy - Railway will automatically:
   - Use Nixpacks for optimized build
   - Install Chromium for Puppeteer
   - Handle package-lock.json sync issues
   - Start the server with `npm start`

## Build Optimizations

- ✅ Using compatible dependency versions
- ✅ Automatic lock file regeneration
- ✅ Pre-installed Chromium to avoid download timeouts
- ✅ Optimized dependency installation with `--omit=dev`

## Health Check

The server includes a health check endpoint at `/` that returns:
```json
{
  "status": "OK",
  "message": "Canva to PSD Converter Backend is running"
}
```

## Troubleshooting

If deployment fails:
1. Check Railway logs for specific error messages
2. Ensure all environment variables are set
3. Verify the repository structure matches the expected layout
4. Check that the `start` script in package.json is correct

## Lock File Handling

The build automatically handles package-lock.json sync issues by:
- Removing the old lock file
- Running `npm install` to generate a fresh one
- Using `--omit=dev` for production-only dependencies

## Build Time Optimization

The new configuration should significantly reduce build time by:
- Using pre-installed Chromium instead of downloading
- Optimized Docker layers
- Faster dependency installation 
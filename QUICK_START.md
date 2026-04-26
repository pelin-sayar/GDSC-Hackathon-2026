# Quick Start Guide

## Get It Running in 2 Minutes

### Frontend

1. Make sure you're in the main project directory:
   ```bash
   cd /Users/pelinsayar/Coding/GDG-Hackathon/GDSC-Hackathon
   ```

2. Install frontend deps (if not already done):
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   # Create .env.local in src/ directory
   echo "VITE_BACKEND_URL=http://localhost:5001" > src/.env.local
   ```

4. Start the frontend:
   ```bash
   npm run dev
   ```

   Opens at `http://localhost:5173`

### Backend (Express - Easiest Option)

In a **separate terminal**:

```bash
# Navigate to backend directory
cd backend

# Install dependencies (first time only)
npm install

# Start the server
npm start
```

Server runs on `http://localhost:5001`

### Test It

1. Open `http://localhost:5173` in your browser
2. Sign in with Firebase
3. Click **📷 Take Photo** button 
4. Allow camera access
5. Take a photo of a product label
6. Ingredients text should auto-extract!

## What's New

✅ **Camera capture modal** - Real camera access instead of file picker  
✅ **Auto OCR processing** - Text extracted automatically from images  
✅ **Backend connection** - Express server for text extraction  
✅ **Error handling** - User-friendly error messages  
✅ **Loading states** - Visual feedback during processing  

## Files Changed/Added

**Frontend Components:**
- `src/components/CameraCapture.jsx` - Camera modal
- `src/lib/imageOCR.js` - Backend communication
- `src/App.jsx` - Integration

**Backend:**
- `backend/server.js` - Express OCR server
- `backend/package.json` - Dependencies
- `backend/firebase-function.js` - Alternative: Firebase Cloud Function

**Documentation:**
- `BACKEND_SETUP.md` - Complete setup guide
- `QUICK_START.md` - This file

## Troubleshooting

### Camera won't open
- Check browser permissions
- Ensure using `localhost` or HTTPS
- Try a different browser (Chrome works best)

### OCR taking too long (>5 seconds)
- First run downloads Tesseract models (~100MB)
- Subsequent runs are faster
- Large/blurry images take longer
- Clear browser cache if stuck

### Backend not responding
- Verify `npm start` shows "listening on http://localhost:5001"
- Check that port 5001 isn't in use: `lsof -i :5001`
- Kill existing process: `pkill -f "node server.js"`

### CORS errors
- Frontend and backend must be on compatible origins
- Express server already has CORS enabled
- Check `VITE_BACKEND_URL` matches where backend is running

## Next: Production Deployment

See `BACKEND_SETUP.md` for:
- Firebase Cloud Functions deployment
- Third-party OCR API integration  
- Environment variable setup
- Cost considerations

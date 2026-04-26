# ShelfScan Backend Setup Guide

## Overview

ShelfScan now has **camera capture functionality** and **automatic OCR text extraction** from ingredient labels. This document explains how to set up the backend to make this work.

## Architecture

```
Frontend (React/Vite)
    ↓
CameraCapture Component
    ↓
Image Processing
    ↓
Backend OCR Service
    ↓
Text Extraction
    ↓
Ingredient Analysis
```

## Frontend Setup (Already Done)

The frontend now includes:

1. **Camera Capture Modal** (`src/components/CameraCapture.jsx`)
   - Access device camera via getUserMedia API
   - Capture photos and send to backend
   - Fallback to file upload

2. **OCR Service** (`src/lib/imageOCR.js`)
   - Sends images to backend OCR endpoint
   - Handles responses and errors

3. **Updated App.jsx**
   - Camera button in the label photo section
   - Auto-processes images with OCR
   - Shows loading and error states

## Backend Setup (Choose One Option)

### Option 1: Simple Express Backend (Recommended for Development)

#### Requirements
- Node.js 18+
- ~500MB disk space (for Tesseract.js models on first run)

#### Setup Steps

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

   Server will run on `http://localhost:5001`

4. **Verify it's working:**
   ```bash
   curl http://localhost:5001/health
   # Response: {"status":"OK","message":"OCR backend is running"}
   ```

#### Configure Frontend

In `src/` directory, create or update `.env.local`:

```env
VITE_BACKEND_URL=http://localhost:5001
```

Or if deploying to production:

```env
VITE_BACKEND_URL=https://your-backend-domain.com
```

### Option 2: Firebase Cloud Function (Recommended for Production)

#### Requirements
- Firebase project with Cloud Vision API enabled
- Firebase CLI installed
- Service account with appropriate permissions

#### Setup Steps

1. **Enable Cloud Vision API:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Select your Firebase project
   - Enable "Cloud Vision API"

2. **Install Firebase CLI:**
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

3. **Set up Cloud Functions:**
   ```bash
   cd functions  # or create this directory
   npm init -y
   npm install firebase-functions firebase-admin @google-cloud/vision
   ```

4. **Add the Cloud Function:**
   Copy the code from `backend/firebase-function.js` to `functions/index.js`

5. **Deploy:**
   ```bash
   firebase deploy --only functions
   ```

6. **Get your function URL:**
   ```bash
   firebase functions:list
   ```

   You'll see a URL like: `https://us-central1-your-project.cloudfunctions.net/extractTextFromImage`

7. **Configure Frontend:**

   Create `.env.local`:
   ```env
   VITE_BACKEND_URL=https://us-central1-your-project.cloudfunctions.net
   ```

#### Cost Considerations
- Google Cloud Vision API: $1.50 per 1,000 requests
- Firebase Cloud Function: Generous free tier (~2M function calls/month)

### Option 3: Third-Party OCR Services

#### Google Cloud Vision (API Key)

```javascript
// Modify imageOCR.js to use Google Vision API directly
const response = await fetch(
  'https://vision.googleapis.com/v1/images:annotateRequest?key=' + 
  import.meta.env.VITE_GOOGLE_VISION_KEY,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image: { content: base64ImageData },
        features: [{ type: 'TEXT_DETECTION' }]
      }]
    })
  }
)
```

#### AWS Textract
- Similar approach using AWS SDK
- ~$1.50 per page analyzed

## Testing the Integration

1. **Start the backend** (Express option):
   ```bash
   cd backend && npm start
   ```

2. **Start the frontend:**
   ```bash
   npm run dev
   ```

3. **Open http://localhost:5173**

4. **Sign in to Firebase**

5. **Test camera or file upload:**
   - Click "📷 Take Photo" or upload a file
   - You should see "Extracting text from image..." 
   - After a few seconds, text should appear in the ingredients field

## Troubleshooting

### "Camera access failed"
- Enable camera permissions in browser settings
- Use HTTPS (camera requires secure context, except localhost)
- Check Firefox/Safari specific permission settings

### "OCR error: Failed to extract text"
- Verify backend is running: `curl http://localhost:5001/health`
- Check browser console for detailed error message
- Ensure image is clear and readable
- Try a different image

### Backend not responding
- **Express**: Check if `npm start` succeeded, should show "listening on http://localhost:5001"
- **Firebase**: Verify function deployed: `firebase functions:list`
- Check CORS headers are set correctly
- For production, check firewall/network settings

### "Sign in before scanning labels"
- Must sign in to Firebase before using OCR
- Uses current user's UID for organizing scans
- Firebase rules must allow authenticated users only

### Long processing time for large images
- Tesseract.js processes locally in browser/Node.js
- Larger images take longer (especially low-quality photos)
- Crop image to label area only for better speed
- Consider compressing image before upload

## API Reference

### POST /extractTextFromImage

**Request:**
```
Content-Type: multipart/form-data

Form fields:
- image: File (required) - Image file to process
- userId: string (optional) - User ID for logging
```

**Response (Success - 200):**
```json
{
  "text": "Ingredients: Flour, Water, Salt, Sugar...",
}
```

**Response (Error - 400/500):**
```json
{
  "error": "Failed to extract text",
  "message": "Detailed error message"
}
```

## Database Schema (Firestore)

Extracted scans are saved in Firestore collection `scans`:

```javascript
{
  userId: "firebase-user-id",
  userEmail: "user@example.com",
  store: "Whole Foods",
  category: "snacks",
  productName: "Cookies",
  brandName: "Demo Brand",
  ingredientText: "Flour, Sugar, Butter...",
  flaggedIngredients: ["potassium_bromate", "red_40"],
  fdaMatches: ["Red No. 40 Aluminum Lake"],
  riskScore: 75,
  walmartUrl: "https://walmart.com/...",
  createdAt: "2024-01-15T10:30:00Z"
}
```

## Next Steps

1. **Add barcode scanning** - Use `@rnwjc/barcode-scanner` for barcode detection
2. **Product lookup** - Query Open Food Facts API by barcode
3. **Caching** - Cache OCR results to reduce API calls
4. **Batch processing** - Process multiple images in one request
5. **Offline support** - Store recent scans locally with IndexedDB

## Environment Variables

Create `.env.local` in `src/` directory:

```env
# Backend URL for OCR processing
VITE_BACKEND_URL=http://localhost:5001

# Optional: Google Vision API key
VITE_GOOGLE_VISION_KEY=your-api-key

# Firebase config (already in use)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
# ... etc
```

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review server logs for detailed error messages
3. Test with sample images first
4. Verify all dependencies installed: `npm list`

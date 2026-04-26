/**
 * Simple Express Backend for ShelfScan
 * 
 * This backend handles image uploads and basic routing.
 * For production OCR, use Firebase Cloud Vision API or Google Vision API
 * 
 * Setup:
 * 1. npm install express cors multer
 * 2. Set BACKEND_URL in frontend .env to http://localhost:5001
 * 3. Run: node server.js
 */

import express from 'express'
import cors from 'cors'
import multer from 'multer'

const app = express()
const port = process.env.PORT || 5001

// Middleware
app.use(cors())
app.use(express.json())

const upload = multer({ storage: multer.memoryStorage() })

/**
 * POST /extractTextFromImage
 * Placeholder endpoint - returns message to manually enter text
 * 
 * For production: integrate with Google Cloud Vision API or Firebase Cloud Function
 */
app.post('/extractTextFromImage', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' })
    }

    // For now, return a message asking user to enter text manually
    // This avoids the Tesseract.js buffer handling issues
    res.json({ 
      text: '',
      message: 'Image received. Please enter the ingredient text manually for now, or integrate with Google Cloud Vision API for automatic extraction.'
    })
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({
      error: 'Server error',
      message: error.message,
    })
  }
})

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'OCR backend is running' })
})

app.listen(port, () => {
  console.log(`OCR backend listening on http://localhost:${port}`)
  console.log(`POST /extractTextFromImage - Extract text from image`)
  console.log(`GET /health - Health check`)
})

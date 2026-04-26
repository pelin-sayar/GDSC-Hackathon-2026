/**
 * Firebase Cloud Function for OCR Processing
 * 
 * Deploy this to Firebase Cloud Functions
 * Command: firebase deploy --only functions
 * 
 * Before deploying:
 * 1. npm install --save @google-cloud/vision
 * 2. Enable the Cloud Vision API on your Firebase project
 * 3. Set BACKEND_URL in .env to your Cloud Function URL
 */

import * as functions from 'firebase-functions'
import * as vision from '@google-cloud/vision'
import * as admin from 'firebase-admin'

admin.initializeApp()

const client = new vision.ImageAnnotatorClient()
const storage = admin.storage()

export const extractTextFromImage = functions.https.onRequest(async (request, response) => {
  // Enable CORS
  response.set('Access-Control-Allow-Origin', '*')
  response.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST')
  response.set('Access-Control-Allow-Headers', 'Content-Type')

  if (request.method === 'OPTIONS') {
    response.status(204).send('')
    return
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const { storagePath, userId } = request.body

    if (!storagePath || !userId) {
      response.status(400).json({ error: 'Missing storagePath or userId' })
      return
    }

    // Get image from Firebase Storage
    const bucket = storage.bucket()
    const file = bucket.file(storagePath)

    // Check if file exists
    const [exists] = await file.exists()
    if (!exists) {
      response.status(404).json({ error: 'Image file not found' })
      return
    }

    // Download image as buffer
    const [imageBuffer] = await file.download()

    // Perform OCR using Google Cloud Vision API
    const request_ = {
      image: { content: imageBuffer },
    }

    const results = await client.textDetection(request_)
    const detections = results[0].textAnnotations

    // Extract all text from detection results
    const text = detections && detections.length > 0 ? detections[0].description : ''

    // Optionally delete the image from storage after processing
    // await file.delete()

    response.json({ text: text.trim() })
  } catch (error) {
    console.error('OCR error:', error)
    response.status(500).json({
      error: 'Failed to extract text',
      message: error.message,
    })
  }
})

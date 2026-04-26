/**
 * Extract ingredients from image using Google Gemini API
 * Free tier: Excellent for this use case
 */
export async function extractTextFromImage(imageFile) {
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    
    if (!apiKey) {
      console.error('Missing API key - set VITE_GEMINI_API_KEY')
      throw new Error('Gemini API key not configured in .env.local')
    }

    console.log('Converting image to base64...')
    const base64Image = await fileToBase64(imageFile)
    
    // Remove "data:image/jpeg;base64," prefix if present
    const imageData = base64Image.includes(',') 
      ? base64Image.split(',')[1] 
      : base64Image

    const mimeType = imageFile.type || 'image/jpeg'

    console.log('Calling Gemini API to extract ingredients...')
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: 'Read all the text from this product label image and extract ONLY the ingredients list. List each ingredient on a new line. Do not include any other text, just the pure ingredients list.',
                },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: imageData,
                  },
                },
              ],
            },
          ],
        }),
      }
    )

    console.log('Gemini API response status:', response.status)

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Gemini API error:', errorData)
      throw new Error(errorData.error?.message || `Gemini API error: ${response.statusText}`)
    }

    const data = await response.json()
    console.log('Gemini response:', data)

    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      const text = data.candidates[0].content.parts[0].text
      console.log('Extracted ingredients:', text)
      return text.trim()
    }

    console.warn('No text found in image')
    return ''
  } catch (error) {
    console.error('Error extracting text from image:', error)
    throw error
  }
}

// Helper: Convert File to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Export ingredients data to JSON
 */
export function exportToJSON(ingredientData) {
  const jsonString = JSON.stringify(ingredientData, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  downloadFile(blob, `ingredients-${Date.now()}.json`)
}

/**
 * Export ingredients data to CSV
 */
export function exportToCSV(ingredientData) {
  const headers = ['Product Name', 'Brand', 'Store', 'Risk Score', 'Flagged Ingredients', 'Extracted Date']
  
  // Handle array of products or single product
  const products = Array.isArray(ingredientData) ? ingredientData : [ingredientData]
  
  const rows = products.map(item => [
    item.productName || '',
    item.brandName || '',
    item.store || '',
    item.riskScore || '',
    (item.flaggedIngredients || []).join('; '),
    new Date().toISOString(),
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv' })
  downloadFile(blob, `ingredients-${Date.now()}.csv`)
}

// Helper: Trigger file download
function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

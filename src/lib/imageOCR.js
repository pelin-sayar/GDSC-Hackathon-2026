const GEMINI_OCR_MODEL = 'gemini-2.5-flash'

export async function extractTextFromImage(imageFile) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Gemini API key is not configured')
  }

  const inlineData = await fileToInlineData(imageFile)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_OCR_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0,
        },
        contents: [
          {
            parts: [
              {
                text: [
                  'Read this grocery label image and extract only the ingredient list.',
                  'Return only the ingredient line or ingredient paragraph, not the full label.',
                  'Exclude nutrition facts, allergen statements, marketing copy, directions, manufacturer text, and any other non-ingredient content.',
                  'If the label contains "Ingredients" or "Ingredients:", return only the text that follows that heading.',
                  'Stop before sections such as Contains, Allergen, Distributed by, Nutrition Facts, directions, Manufactured by, or Product of.',
                  'Return plain text only.',
                  'Do not add commentary, headings, bullets, or JSON.',
                  'If no ingredients are visible, return an empty string.',
                ].join(' '),
              },
              {
                inlineData,
              },
            ],
          },
        ],
      }),
    },
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    const message = errorData?.error?.message || `Gemini OCR error: ${response.statusText}`
    if (isGeminiOcrQuotaError(message)) {
      throw new Error(
        'Sorry! Since our app is free, there are limited API quotas and rate-limits, please type ingredients for now and try again later.',
      )
    }
    throw new Error(message)
  }

  const data = await response.json()
  const text =
    data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n').trim() || ''

  return cleanupExtractedIngredients(text)
}

export function exportToJSON(ingredientData) {
  const jsonString = JSON.stringify(ingredientData, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  downloadFile(blob, `ingredients-${Date.now()}.json`)
}

export function exportToCSV(ingredientData) {
  const headers = ['Product Name', 'Brand', 'Store', 'Risk Score', 'Flagged Ingredients', 'Extracted Date']
  const products = Array.isArray(ingredientData) ? ingredientData : [ingredientData]

  const rows = products.map((item) => [
    item.productName || '',
    item.brandName || '',
    item.store || '',
    item.riskScore || '',
    (item.flaggedIngredients || []).join('; '),
    new Date().toISOString(),
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv' })
  downloadFile(blob, `ingredients-${Date.now()}.csv`)
}

async function fileToInlineData(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })

  if (typeof dataUrl !== 'string') {
    throw new Error('Failed to encode image')
  }

  const [, base64Data = ''] = dataUrl.split(',', 2)
  return {
    mimeType: file.type || 'image/jpeg',
    data: base64Data,
  }
}

function cleanupExtractedIngredients(text) {
  const normalized = text.replace(/\r/g, '').trim()
  if (!normalized) return ''

  const sectionMatch = normalized.match(/ingredients?\s*[:.-]?\s*([\s\S]*)/i)
  let extracted = sectionMatch ? sectionMatch[1] : normalized

  extracted = extracted
    .split(/\b(?:contains|allergen(?: information)?|distributed by|manufactured by|manufactured|nutrition facts|directions|suggested use|warning|storage instructions|keep refrigerated|product of)\b/i)[0]
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[^a-zA-Z]+/, '')
    .trim()

  return extracted.replace(/[.;,\s]+$/, '').trim()
}

function isGeminiOcrQuotaError(message) {
  const normalized = String(message || '').toLowerCase()
  return (
    normalized.includes('quota exceeded') ||
    normalized.includes('rate-limit') ||
    normalized.includes('rate limit') ||
    normalized.includes('resource exhausted') ||
    normalized.includes('429') ||
    normalized.includes('free_tier_requests')
  )
}

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

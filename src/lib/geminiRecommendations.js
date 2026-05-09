const GEMINI_MODEL = 'gemini-2.5-flash'
const FRIENDLY_QUOTA_MESSAGE =
  'Sorry! Since our app is free, there are limited API quotas and rate-limits, please try again later.'

export async function getHealthyRecommendations({
  store,
  productName,
  category,
  ingredientText,
  flaggedIngredients,
}) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    return {
      source: 'unavailable',
      summary: 'Gemini API key is not configured, so web-grounded recommendations are unavailable.',
      recommendations: [],
      searchQueries: [],
      citations: [],
    }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tools: [
          {
            google_search: {},
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
        contents: [
          {
            parts: [
              {
                text: buildPrompt({
                  store,
                  productName,
                  category,
                  ingredientText,
                  flaggedIngredients,
                }),
              },
            ],
          },
        ],
      }),
    },
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    const message = errorData?.error?.message || `Gemini recommendation error: ${response.statusText}`
    if (isGeminiQuotaError(message)) {
      throw new Error(FRIENDLY_QUOTA_MESSAGE)
    }
    throw new Error(message)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || ''
  const parsed = parseJson(text)
  const groundingMetadata = data?.candidates?.[0]?.groundingMetadata

  return {
    source: 'gemini-google-search',
    summary:
      parsed.summary ||
      `Gemini searched the web for healthier ${store} alternatives in ${category || 'this category'}.`,
    recommendations: normalizeRecommendations(parsed, store),
    searchQueries: groundingMetadata?.webSearchQueries || [],
    citations: extractCitations(groundingMetadata),
  }
}

function buildPrompt({ store, productName, category, ingredientText, flaggedIngredients }) {
  const ingredientSnippet = ingredientText ? ingredientText.slice(0, 1200) : 'No ingredient text provided.'
  const flagged = flaggedIngredients.length ? flaggedIngredients.join(', ') : 'None flagged yet.'

  return [
    `You are helping a shopper choose healthier grocery options at ${store}.`,
    'Use Google Search grounding to search the public web for currently available products.',
    `Only recommend products when the web evidence suggests they are sold by or available through ${store}.`,
    'Prefer official store product pages, manufacturer pages, or reputable grocery listings as evidence.',
    `Current product: ${productName || 'Unknown product'}.`,
    `Target category: ${category || 'unspecified'}.`,
    `Ingredients or OCR text: ${ingredientSnippet}`,
    `Flagged ingredients: ${flagged}`,
    '',
    'Find 3 real, reasonable healthier alternatives for the selected store.',
    'Prefer alternatives in the same category and similar use case as the current product.',
    'Avoid recommending products that likely contain the same flagged ingredients when better options exist.',
    'If availability evidence is weak, say so in the evidence field rather than inventing certainty.',
    'Return only JSON. Do not wrap the JSON in markdown unless absolutely necessary.',
    'Return valid JSON with this shape:',
    '{',
    '  "summary": "one short sentence",',
    '  "recommendations": [',
    '    {',
    '      "brand": "string",',
    '      "product": "string",',
    '      "store": "string",',
    '      "reason": "string",',
    '      "whyHealthier": "string",',
    '      "evidence": "short sentence about why you believe it is sold at the selected store",',
    '      "avoids": ["string"]',
    '    }',
    '  ]',
    '}',
  ].join('\n')
}

function parseJson(text) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i)
  const payload = fenced?.[1] || trimmed
  const firstBrace = payload.indexOf('{')
  const lastBrace = payload.lastIndexOf('}')
  const jsonText = firstBrace >= 0 && lastBrace >= 0 ? payload.slice(firstBrace, lastBrace + 1) : payload

  return JSON.parse(jsonText)
}

function normalizeRecommendations(parsed, fallbackStore) {
  if (!parsed?.recommendations?.length) {
    return []
  }

  return parsed.recommendations
    .map((item) => ({
      store: item.store || fallbackStore,
      brand: item.brand || 'Unknown brand',
      product: item.product || 'Unknown product',
      reason: item.reason || item.evidence || 'Gemini identified this as a plausible healthier alternative.',
      whyHealthier:
        item.whyHealthier || item.reason || 'Likely a cleaner ingredient profile than the scanned product.',
      evidence: item.evidence || '',
      avoids: Array.isArray(item.avoids) ? item.avoids : [],
    }))
    .filter((item) => item.product)
    .slice(0, 3)
}

function extractCitations(groundingMetadata) {
  const chunks = groundingMetadata?.groundingChunks || []
  const seen = new Set()

  return chunks
    .map((chunk) => chunk?.web)
    .filter((web) => web?.uri && web?.title)
    .filter((web) => {
      if (seen.has(web.uri)) return false
      seen.add(web.uri)
      return true
    })
}

function isGeminiQuotaError(message) {
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

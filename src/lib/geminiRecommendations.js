const GEMINI_MODEL = 'gemini-2.5-flash'

export async function getHealthyRecommendations({
  store,
  productName,
  category,
  ingredientText,
  flaggedIngredients,
  candidates,
}) {
  const fallback = buildFallbackRecommendations({
    store,
    productName,
    category,
    flaggedIngredients,
    candidates,
  })

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    return {
      source: 'fallback',
      summary: 'Gemini API key is not configured, so local ranking was used.',
      recommendations: fallback,
    }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
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
                  candidates,
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
    throw new Error(
      errorData?.error?.message || `Gemini recommendation error: ${response.statusText}`,
    )
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || ''
  const parsed = parseJson(text)
  const recommendations = normalizeRecommendations(parsed, candidates, fallback)

  return {
    source: 'gemini',
    summary: parsed.summary || 'Gemini ranked the healthiest store options from the local catalog.',
    recommendations,
  }
}

function buildPrompt({
  store,
  productName,
  category,
  ingredientText,
  flaggedIngredients,
  candidates,
}) {
  const candidateList = candidates
    .map(
      (item) =>
        `- ${item.brand} | ${item.product} | category: ${item.category} | avoids: ${item.avoids.join(', ')} | pitch: ${item.pitch}`,
    )
    .join('\n')

  const ingredientSnippet = ingredientText ? ingredientText.slice(0, 1200) : 'No ingredient text provided.'
  const flagged = flaggedIngredients.length ? flaggedIngredients.join(', ') : 'None flagged yet.'

  return [
    `You are helping a shopper choose healthier grocery options at ${store}.`,
    `Current product: ${productName || 'Unknown product'}.`,
    `Target category: ${category || 'unspecified'}.`,
    `Ingredients or OCR text: ${ingredientSnippet}`,
    `Flagged ingredients: ${flagged}`,
    '',
    'Pick the best 3 recommendations ONLY from the candidate list below.',
    'Rank by healthier ingredient profile, avoidance of flagged ingredients, and usefulness as a realistic store alternative.',
    'Do not invent products that are not in the list.',
    'Return valid JSON with this shape:',
    '{',
    '  "summary": "one short sentence",',
    '  "recommendations": [',
    '    {',
    '      "brand": "string",',
    '      "product": "string",',
    '      "reason": "string",',
    '      "whyHealthier": "string",',
    '      "avoids": ["string"]',
    '    }',
    '  ]',
    '}',
    '',
    'Candidate list:',
    candidateList,
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

function normalizeRecommendations(parsed, candidates, fallback) {
  if (!parsed?.recommendations?.length) {
    return fallback
  }

  const candidateLookup = new Map(
    candidates.map((item) => [`${item.brand}::${item.product}`.toLowerCase(), item]),
  )

  const normalized = parsed.recommendations
    .map((item) => {
      const key = `${item.brand || ''}::${item.product || ''}`.toLowerCase()
      const match = candidateLookup.get(key)
      if (!match) return null

      return {
        ...match,
        reason: item.reason || match.pitch,
        whyHealthier: item.whyHealthier || item.reason || match.pitch,
        avoids: Array.isArray(item.avoids) && item.avoids.length ? item.avoids : match.avoids,
      }
    })
    .filter(Boolean)

  return normalized.length ? normalized.slice(0, 3) : fallback
}

function buildFallbackRecommendations({
  store,
  productName,
  category,
  flaggedIngredients,
  candidates,
}) {
  const flaggedSet = new Set(flaggedIngredients.map(normalizeText))
  const productTokens = normalizeText(productName).split(' ').filter(Boolean)

  return candidates
    .map((item) => {
      const overlap = item.avoids.reduce(
        (count, avoided) => count + (flaggedSet.has(normalizeText(avoided)) ? 1 : 0),
        0,
      )
      const categoryBoost = item.category === category ? 2 : 0
      const productSimilarity = productTokens.some((token) =>
        normalizeText(`${item.brand} ${item.product}`).includes(token),
      )
        ? 1
        : 0

      return {
        ...item,
        score: overlap * 5 + categoryBoost + productSimilarity,
        reason: item.pitch,
        whyHealthier: `Prioritizes a simpler ingredient profile for ${store}.`,
      }
    })
    .sort((left, right) => right.score - left.score || left.product.localeCompare(right.product))
    .slice(0, 3)
    .map((item) => item)
}

function normalizeText(value = '') {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

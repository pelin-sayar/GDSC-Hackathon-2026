const splitIngredients = (text) =>
  text
    .toLowerCase()
    .replace(/ingredients?:/g, '')
    .split(/[,\n.]/)
    .map((item) => item.trim())
    .filter(Boolean)

export function analyzeIngredients(text, rules, synonyms) {
  const normalized = splitIngredients(text)
  const matches = Object.entries(synonyms)
    .filter(([, aliases]) =>
      aliases.some((alias) => normalized.some((ingredient) => ingredient.includes(alias))),
    )
    .map(([key, aliases]) => ({
      key,
      aliases,
      ...rules[key],
    }))
    .sort((left, right) => severityWeight(right.severity) - severityWeight(left.severity))

  const score = Math.min(
    92,
    matches.reduce((total, item) => total + severityWeight(item.severity) * 12, 0),
  )

  return { matches, normalized, score }
}

export function deriveCategory(selectedCategory, text, matches) {
  if (selectedCategory) return selectedCategory

  const normalized = text.toLowerCase()
  if (normalized.includes('bread') || matches.some((item) => item.key === 'potassium_bromate')) return 'bread'
  if (normalized.includes('cereal')) return 'cereal'
  if (normalized.includes('drink') || normalized.includes('soda')) return 'drinks'
  if (normalized.includes('candy')) return 'candy'
  return 'snacks'
}

export function findAlternatives({ catalog, currentBrand, matches, category, store }) {
  const avoidKeys = new Set(matches.map((item) => item.key))

  return catalog
    .filter((item) => item.store === store && item.category === category)
    .filter((item) => item.brand.toLowerCase() !== currentBrand.trim().toLowerCase())
    .filter((item) => item.avoids.some((key) => avoidKeys.has(key)))
    .slice(0, 4)
}

function severityWeight(level) {
  if (level === 'high') return 3
  if (level === 'medium') return 2
  return 1
}

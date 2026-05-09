import { findEuAdditiveByNameOrECode } from './foodAdditivesEU'
import { findFoodSubstanceByIngredient } from './foodSubstances'

export const splitIngredients = (text) =>
  text
    .toLowerCase()
    .replace(/ingredients?:/g, '')
    .split(/[,\n.]/)
    .map((item) => item.trim())
    .filter(Boolean)

export function analyzeIngredients(text, rules, synonyms, foodSubstances = [], euAdditives = []) {
  const normalized = splitIngredients(text)
  const matches = normalized
    .map((ingredient) =>
      buildIngredientMatch({
        ingredient,
        rules,
        synonyms,
        foodSubstances,
        euAdditives,
      }),
    )
    .filter(Boolean)
    .filter((match, index, all) => all.findIndex((item) => item.key === match.key) === index)
    .sort((left, right) => severityWeight(right.severity) - severityWeight(left.severity))

  const score = Math.min(
    92,
    matches.reduce((total, item) => total + severityWeight(item.severity) * 10, 0),
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

function buildIngredientMatch({ ingredient, rules, synonyms, foodSubstances, euAdditives }) {
  const customEntry = Object.entries(synonyms).find(([, aliases]) =>
    aliases.some((alias) => ingredient.includes(alias)),
  )

  const customKey = customEntry?.[0] || null
  const customAliases = customEntry?.[1] || []
  const customRule = customKey ? rules[customKey] : null
  const fdaMatch = findFoodSubstanceByIngredient(ingredient, foodSubstances)
  const euMatch = findEuAdditiveByNameOrECode(euAdditives, ingredient)

  if (!customRule && !fdaMatch && !euMatch) {
    return null
  }

  const label =
    customRule?.label ||
    euMatch?.additive_name?.replace(/<.*?>/g, '') ||
    fdaMatch?.substance ||
    ingredient

  return {
    key: customKey || `dataset-${normalizeKey(label)}`,
    aliases: customAliases,
    label,
    severity: deriveSeverity({ customRule, fdaMatch, euMatch }),
    reason: deriveReason({ ingredient, customRule, fdaMatch, euMatch }),
    why: deriveWhy({ customRule, fdaMatch, euMatch }),
    regions: deriveRegions({ customRule, fdaMatch, euMatch }),
    foodCategory: euMatch?.food_category || '',
    restriction: euMatch?.restriction_type || '',
    restrictionComment: euMatch?.restriction_comment || '',
    legislation: euMatch?.legislation_short || '',
    eCode: euMatch?.additive_e_code || '',
    fdaSubstance: fdaMatch?.substance || '',
    fdaTechnicalEffect: fdaMatch?.technicalEffect || '',
    fdaProhibited: fdaMatch?.prohibited || '',
    rawIngredient: ingredient,
  }
}

function deriveSeverity({ customRule, fdaMatch, euMatch }) {
  if (customRule?.severity) return customRule.severity

  const prohibitedText = `${fdaMatch?.prohibited || ''} ${fdaMatch?.administrative || ''}`.toLowerCase()
  if (prohibitedText.includes('prohibit') || prohibitedText.includes('not permitted')) {
    return 'high'
  }

  const euRestriction = String(euMatch?.restriction_type || '').toLowerCase()
  if (euRestriction === 'banned') return 'high'
  if (euMatch) return 'medium'

  const technicalEffect = String(fdaMatch?.technicalEffect || '').toLowerCase()
  if (
    technicalEffect.includes('color') ||
    technicalEffect.includes('preserv') ||
    technicalEffect.includes('emulsifier') ||
    technicalEffect.includes('surface-active') ||
    technicalEffect.includes('sweetener')
  ) {
    return 'medium'
  }

  return 'low'
}

function deriveReason({ ingredient, customRule, fdaMatch, euMatch }) {
  if (customRule?.reason) return customRule.reason
  if (euMatch && fdaMatch) {
    return `Matched directly in both the FDA food substances dataset and the EU food additives dataset for "${ingredient}".`
  }
  if (euMatch) {
    return `Matched directly in the EU food additives dataset${euMatch.additive_e_code ? ` as ${euMatch.additive_e_code}` : ''}.`
  }
  if (fdaMatch) {
    return `Matched directly in the FDA food substances dataset${fdaMatch.technicalEffect ? ` as ${fdaMatch.technicalEffect.toLowerCase()}` : ''}.`
  }
  return `Matched ingredient: ${ingredient}.`
}

function deriveWhy({ customRule, fdaMatch, euMatch }) {
  if (customRule?.why) return customRule.why
  if (euMatch?.restriction_comment) return euMatch.restriction_comment
  if (euMatch?.legislation_short) return `EU reference: ${euMatch.legislation_short}.`
  if (fdaMatch?.technicalEffect) return `FDA technical effect: ${fdaMatch.technicalEffect}.`
  return 'This ingredient appears in one or more regulatory datasets used by the app.'
}

function deriveRegions({ customRule, fdaMatch, euMatch }) {
  if (customRule?.regions) return customRule.regions

  return {
    us: fdaMatch
      ? fdaMatch.prohibited
        ? `FDA dataset match; prohibited note: ${fdaMatch.prohibited}`
        : 'listed in FDA dataset'
      : 'no direct FDA match',
    eu: euMatch
      ? euMatch.restriction_type
        ? `${euMatch.restriction_type}${euMatch.additive_e_code ? ` (${euMatch.additive_e_code})` : ''}`
        : 'listed in EU additives dataset'
      : 'no direct EU match',
    asia: customRule?.regions?.asia || 'no Asia dataset loaded',
  }
}

function severityWeight(level) {
  if (level === 'high') return 3
  if (level === 'medium') return 2
  return 1
}

function normalizeKey(value = '') {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

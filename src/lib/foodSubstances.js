import foodSubstancesCsvUrl from '../data/FoodSubstances.csv?url'

export async function loadFoodSubstances() {
  const response = await fetch(foodSubstancesCsvUrl)
  const csvText = await response.text()
  return parseFoodSubstancesCsv(csvText)
}

export function findFdaMatches(matches, foodSubstances) {
  if (!foodSubstances.length) return []

  return matches
    .map((match) => {
      const searchTerms = [match.label, ...(match.aliases || [])].map(normalizeText)
      const hit = foodSubstances.find((row) =>
        searchTerms.some(
          (term) => row.searchBlob.includes(term) || row.substanceNormalized === term,
        ),
      )

      if (!hit) return null

      return {
        key: match.key,
        label: match.label,
        substance: hit.substance,
        technicalEffect: hit.technicalEffect,
        administrative: hit.administrative,
        prohibited: hit.prohibited,
        labeling: hit.labeling,
        grasUpdate: hit.grasUpdate,
      }
    })
    .filter(Boolean)
}

export function findFoodSubstanceByIngredient(ingredient, foodSubstances) {
  if (!ingredient || !foodSubstances.length) return null

  const normalized = normalizeText(ingredient)
  if (!normalized) return null

  return (
    foodSubstances.find(
      (row) =>
        row.substanceNormalized === normalized ||
        row.searchBlob.includes(normalized) ||
        normalized.includes(row.substanceNormalized),
    ) || null
  )
}

function parseFoodSubstancesCsv(csvText) {
  const lines = csvText.split(/\r?\n/)
  const headerIndex = lines.findIndex((line) => line.startsWith('CAS Reg No'))
  if (headerIndex === -1) return []

  const records = []
  const headers = parseCsvLine(lines[headerIndex])

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim()) continue

    const values = parseCsvLine(line)
    if (!values.length || values.every((value) => !value.trim())) continue

    const row = Object.fromEntries(headers.map((header, idx) => [header, values[idx] || '']))
    const substance = cleanCell(row.Substance)
    const otherNames = cleanCell(row['Other Names'])

    if (!substance) continue

    records.push({
      substance,
      substanceNormalized: normalizeText(substance),
      technicalEffect: cleanCell(row['Used for (Technical Effect)']),
      administrative: cleanCell(row['Reg Administrative']),
      prohibited: cleanCell(row['Reg prohibited189']),
      labeling: cleanCell(row['regs Labeling & Standards ']),
      grasUpdate: cleanCell(row['Most Recent GRAS Pub Update']),
      otherNames,
      searchBlob: [substance, otherNames].map(normalizeText).join(' '),
    })
  }

  return records
}

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === ',' && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }

    current += character
  }

  cells.push(current)
  return cells
}

function cleanCell(value = '') {
  return value
    .replace(/<br\s*\/?>/gi, '; ')
    .replace(/&diams;/g, '')
    .replace(/=T\("([^"]+)"\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeText(value = '') {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

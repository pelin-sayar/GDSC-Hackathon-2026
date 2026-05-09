import asiaCsvUrl from '../data/3_2.csv?url'

export async function loadAsiaStandards() {
  const response = await fetch(asiaCsvUrl)
  const csvText = await response.text()
  return parseAsiaCsv(csvText)
}

export function findAsiaMatchesByIngredient(ingredient, asiaRecords) {
  if (!ingredient || !asiaRecords.length) return []

  const normalized = normalizeText(ingredient)
  if (!normalized) return []

  return asiaRecords.filter(
    (row) =>
      row.englishNameNormalized === normalized ||
      row.componentBlob.includes(normalized) ||
      row.englishNameNormalized.includes(normalized) ||
      normalized.includes(row.englishNameNormalized),
  )
}

export function summarizeAsiaStatus(matches) {
  if (!matches.length) return 'no direct Taiwan dataset match'

  const uses = Array.from(new Set(matches.flatMap((row) => row.uses).filter(Boolean))).slice(0, 3)
  const countries = Array.from(new Set(matches.map((row) => row.originCountry).filter(Boolean))).slice(0, 3)

  const parts = ['listed in Taiwan additives dataset']
  if (uses.length) {
    parts.push(`use: ${uses.join(', ')}`)
  }
  if (countries.length) {
    parts.push(`origins: ${countries.join(', ')}`)
  }

  return parts.join(' | ')
}

function parseAsiaCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []

  const headers = parseCsvLine(lines[0].replace(/^\uFEFF/, ''))
  const englishIndex = headers.findIndex((header) => header.includes('英文品名'))
  const usesIndex = headers.findIndex((header) => header.includes('用途'))
  const originIndex = headers.findIndex((header) => header.includes('製造廠國別'))
  const componentsIndex = headers.findIndex((header) => header.includes('成分'))

  const records = []
  for (let index = 1; index < lines.length; index += 1) {
    const values = parseCsvLine(lines[index])
    if (!values.length) continue

    const englishName = cleanCell(values[englishIndex] || '')
    if (!englishName) continue

    const components = cleanCell(values[componentsIndex] || '')
    records.push({
      englishName,
      englishNameNormalized: normalizeText(englishName),
      uses: cleanCell(values[usesIndex] || '')
        .split(';;')
        .map((item) => item.trim())
        .filter(Boolean),
      originCountry: cleanCell(values[originIndex] || ''),
      components,
      componentBlob: normalizeText(components),
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
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeText(value = '') {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Utility to load and query EU food additives from the UNIONLIST_DATA_TR_FOOD_ADDITIVES_DETAILS.json_ file

const EU_ADD_LIST_URL = new URL('../data/UNIONLIST_DATA_TR_FOOD_ADDITIVES_DETAILS.json_', import.meta.url)
  .href

export async function loadEuAdditives() {
  const response = await fetch(EU_ADD_LIST_URL)
  const text = await response.text()
  // The file is line-delimited JSON, not a JSON array
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

export function findEuAdditiveByNameOrECode(additives, nameOrECode) {
  const norm = (s) => s?.toLowerCase().replace(/<.*?>/g, '').trim()
  return additives.find(
    (item) =>
      norm(item.additive_name) === norm(nameOrECode) ||
      norm(item.additive_e_code) === norm(nameOrECode),
  )
}

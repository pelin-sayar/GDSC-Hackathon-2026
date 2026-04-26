export function getWalmartIngredients() {
  throw new Error(
    'Walmart scraping must run server-side. Move the ScrapingBee API call into a Firebase Cloud Function or other backend proxy before invoking it from the app.',
  )
}

export function buildWalmartScrapePayload(url) {
  return {
    url,
    render_js: 'true',
    extract_rules: {
      ingredients: "div[data-testid='ingredients-list']",
      product_name: 'h1',
    },
  }
}

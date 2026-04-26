export const regionLabels = {
  us: 'United States',
  eu: 'European Union',
  asia: 'Asia markets',
}

export const ingredientRules = {
  bha: {
    label: 'BHA',
    severity: 'high',
    reason: 'Synthetic preservative with ongoing safety controversy.',
    why: 'Some regulators allow it with limits, while others push manufacturers toward safer preservative systems.',
    regions: {
      us: 'allowed with limits',
      eu: 'restricted',
      asia: 'mixed restrictions',
    },
  },
  potassium_bromate: {
    label: 'Potassium bromate',
    severity: 'high',
    reason: 'Flour improver that is banned or heavily discouraged in multiple regions.',
    why: 'It is controversial because of carcinogenicity concerns and is no longer considered necessary in modern bread production.',
    regions: {
      us: 'flagged',
      eu: 'banned',
      asia: 'banned in many markets',
    },
  },
  red_40: {
    label: 'Red 40',
    severity: 'medium',
    reason: 'Artificial dye commonly scrutinized in children’s food products.',
    why: 'Color additives can trigger consumer concern around hyperactivity and drive reformulation in stricter markets.',
    regions: {
      us: 'allowed',
      eu: 'warning label territory',
      asia: 'mixed restrictions',
    },
  },
  yellow_5: {
    label: 'Yellow 5',
    severity: 'medium',
    reason: 'Artificial dye with labeling concerns across markets.',
    why: 'It remains legal in many countries, but disclosure and reformulation pressure are higher outside the US.',
    regions: {
      us: 'allowed',
      eu: 'warning label territory',
      asia: 'mixed restrictions',
    },
  },
  titanium_dioxide: {
    label: 'Titanium dioxide',
    severity: 'high',
    reason: 'Color additive banned for food use in the EU.',
    why: 'Its safety debate centers on uncertainty around genotoxicity and nanoparticle exposure.',
    regions: {
      us: 'flagged',
      eu: 'banned',
      asia: 'mixed restrictions',
    },
  },
  sodium_benzoate: {
    label: 'Sodium benzoate',
    severity: 'medium',
    reason: 'Preservative that becomes more controversial in certain formulations.',
    why: 'It can raise concern when paired with acidic beverages or artificial colors, even though it is still widely used.',
    regions: {
      us: 'allowed',
      eu: 'allowed with limits',
      asia: 'allowed with limits',
    },
  },
  palm_oil: {
    label: 'Palm oil',
    severity: 'low',
    reason: 'Not a regulatory ban issue, but often flagged for processing and sustainability concerns.',
    why: 'Shoppers may want lower-processed fats or lower environmental impact alternatives even when the ingredient is legal.',
    regions: {
      us: 'allowed',
      eu: 'allowed',
      asia: 'allowed',
    },
  },
  high_fructose_corn_syrup: {
    label: 'High fructose corn syrup',
    severity: 'medium',
    reason: 'Sweetener that many consumers actively try to avoid.',
    why: 'It is broadly legal, but it is frequently used as a heuristic for heavily processed foods.',
    regions: {
      us: 'allowed',
      eu: 'less common',
      asia: 'mixed usage',
    },
  },
}

export const ingredientSynonyms = {
  bha: ['bha', 'butylated hydroxyanisole'],
  potassium_bromate: ['potassium bromate', 'bromated flour'],
  red_40: ['red 40', 'allura red', 'fd&c red no. 40'],
  yellow_5: ['yellow 5', 'tartrazine', 'fd&c yellow no. 5'],
  titanium_dioxide: ['titanium dioxide'],
  sodium_benzoate: ['sodium benzoate'],
  palm_oil: ['palm oil'],
  high_fructose_corn_syrup: ['high fructose corn syrup', 'hfcs'],
}

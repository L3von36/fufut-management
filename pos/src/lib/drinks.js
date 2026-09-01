/**
 * What counts as a drink, shared by the station boards and the barista's
 * recipe filter.
 *
 * This regex used to live in KitchenView.vue alone. It moves here now that a
 * second screen needs the same judgement: RecipesView filters the recipe book
 * down to the bar's own recipes for the barista role, and it must agree with
 * the boards about what "the bar" means — a latte recipe hidden from the
 * barista while lattes still route to their board would be a silent hole.
 *
 * A line belongs to the bar when its category — or, for rows written before
 * categories were stamped, its name — reads as a drink; everything else is
 * hot-kitchen work.
 */
export const DRINK_WORDS = /drink|coffee|beverage|juice|water|soda|\bbar\b|\btea\b|latte|espresso|cappuccino|macchiato|americano|mocha|smoothie|shake|lemonade/i

export function nameIsDrink(name) {
  return DRINK_WORDS.test(String(name || ''))
}

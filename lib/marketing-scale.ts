/**
 * The type and radius scale for the marketing surface — landing page, legal
 * pages, the notice pages, the auth shell.
 *
 * It was written down after counting what was actually in use: 22 distinct font
 * sizes and 16 distinct corner radii on the landing page alone, including
 * 10.5 / 11 / 11.5 and 13 / 13.5 / 13.6 — the same size three times over, with
 * no intent behind the difference. Nobody chose that; it accumulated. The cost
 * is not any single value, it is that the page has no rhythm and the next
 * person has nothing to pick from, so they invent a 23rd.
 *
 * The steps below are the sizes that were already doing real work, rounded
 * together. Every value moved by at most 1px, so the page looks the same — the
 * point is that from here there is a list to choose from.
 *
 * Sizes are numbers, not strings, because this codebase styles with the `style`
 * prop and React appends `px`.
 */

export const fs = {
  /** Uppercase eyebrows, tiny badges, the smallest legible label. */
  micro: 11,
  /** Captions, footnotes, chips, trust marks. */
  caption: 12,
  /** Dense secondary text — link lists, meta rows. */
  small: 13.5,
  /** Secondary body. The most common size on the page. */
  body: 14,
  /** Body that needs a little more presence — feature descriptions. */
  bodyLg: 15,
  /** Buttons, nav, anything the eye should land on before the prose. */
  lead: 16,
  /** Lead paragraphs under a heading. */
  leadLg: 17,
  /** Standfirst, pull quotes, the largest running text. */
  subhead: 18,
  /** Card and accordion headings. */
  cardTitle: 21,
  /** Section sub-titles that are not the section's own h2. */
  sectionTitle: 25,
  /** The heading over a sign-in or reset form. */
  formTitle: 30,
  /** The h1 on a page with no hero — 404, the crashed-boundary notice. */
  pageTitle: 34,
  /** Display figures: the price. */
  display: 62,
} as const

/**
 * Corner radii. Six steps, because a soft dark UI reads as one system when the
 * curvature is quantised and as a collage when it is not — 6, 7, 8 and 9 px all
 * appeared on the same screen.
 */
export const radius = {
  /** Icon tiles, small chips, tick badges. */
  xs: 8,
  /** Buttons, inputs, list rows. */
  sm: 12,
  /** Cards and panels. */
  md: 16,
  /** Large feature cards, the pricing panel, stat tiles. */
  lg: 24,
  /** The biggest surfaces. */
  xl: 32,
  /** Pills and circles. */
  full: 999,
} as const

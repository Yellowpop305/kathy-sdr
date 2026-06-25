/**
 * Who Kathy should reach at a target account — defined as a *persona*, not a
 * fixed title list. This drives both the search seed and the LLM relevance
 * judge, so Kathy targets anyone who influences in-store signage / design /
 * brand / procurement decisions and roles similar to them, while excluding
 * people whose work has nothing to do with that.
 */
export const PERSONA_DEFINITION = `Yellowpop sells custom LED neon signage to multi-location brands.
The right people to reach are those who INFLUENCE OR DECIDE on in-store visual elements,
signage, store build-outs/remodels, brand environment, or who SOURCE/BUY such products.

RELEVANT functions (and anything closely related, at manager/director/VP level):
- Marketing & Brand: brand, marketing, creative, growth, field/retail marketing.
- Retail / Customer Experience: retail experience, customer experience, store experience.
- Store & Retail Design / Visual Merchandising: store design, retail design, visual merchandising, store development, store planning.
- Procurement & Purchasing: procurement, purchasing, sourcing, category buying (esp. fixtures/signage/store goods).
- Construction & Facilities: construction, store development/build-out, facilities (store-facing).

NOT relevant (exclude these): CEO, President, Founder, Owner, C-suite/chief officers,
finance/accounting, HR/people/recruiting, IT/engineering/software/data, legal,
direct sales/account executives, customer support reps, supply-chain for unrelated goods,
and anyone whose role has no connection to store environment, signage, design, procurement, or construction.

Prefer mid-level managers, senior managers, and directors. Avoid the very top executives.`;

/**
 * Broad seed of titles spanning the persona, used with the API's
 * `expand_job_titles` so semantically-similar roles are also returned.
 * The LLM relevance judge then refines this pool down to genuine fits.
 */
export const PERSONA_TITLE_SEED = [
  // Marketing & Brand
  "Brand Manager",
  "Marketing Manager",
  "Director of Brand",
  "VP of Marketing",
  "Creative Director",
  // Retail / Customer Experience
  "Customer Experience Manager",
  "Retail Experience Manager",
  "Director of Retail Experience",
  // Store / Retail Design & Visual Merchandising
  "Store Designer",
  "Retail Designer",
  "Visual Merchandising Manager",
  "Store Development Manager",
  // Procurement & Purchasing
  "Procurement Manager",
  "Purchasing Manager",
  "Category Manager",
  // Construction & Facilities
  "Construction Manager",
  "Facilities Manager",
];

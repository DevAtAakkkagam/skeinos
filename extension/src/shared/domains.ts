// Professional-domain axis for the prompt library (prompt-seed-catalog, D-G). The
// single source of truth for which domains exist, their stable ids, their display
// labels, and their order — consumed by the bundled starter-prompt catalog and by
// the future onboarding domain-picker. A `Prompt.domain` is set once at seed install
// and stays the stable filter key, independent of the user-editable category (D-A).
//
// Pure data + types: no imports, no behavior. Labels are kept here (not inline in
// markup) so the UI stays i18n-ready (PREACT guardrail).

/** Every supported professional domain. Members double as catalog `seedId` prefixes. */
export type DomainId =
  | 'software-engineering'
  | 'marketing-content'
  | 'data-analytics'
  | 'education-research';

/** One domain's registry entry: its stable `id` and a human display `label`. */
export interface DomainEntry {
  id: DomainId;
  label: string;
}

/**
 * The ordered registry of all domains — the only source of truth for which domains
 * exist and the order the catalog and onboarding picker present them in. Adding a
 * domain means appending here (and authoring its five catalog seeds).
 */
export const DOMAIN_REGISTRY: readonly DomainEntry[] = [
  { id: 'software-engineering', label: 'Software engineering' },
  { id: 'marketing-content', label: 'Marketing & content' },
  { id: 'data-analytics', label: 'Data & analytics' },
  { id: 'education-research', label: 'Education & research' },
];

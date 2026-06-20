## ADDED Requirements

### Requirement: Prompt data model

The system SHALL define a canonical `Prompt` record carrying its title, template `body`, the parsed
`variables`, organizational metadata (`tags`, `promptFolderId`), a multi-platform target list
(`targetModels`), an optional slash alias (`slug`), and dormant usage fields (`usageCount`,
`lastUsedAt`). A `Prompt` SHALL be a syncable metadata record (it carries the sync envelope). The
per-variable shape `PromptVar` SHALL carry `name`, an optional `default`, a `type` of `text` or
`select`, and optional `options`.

#### Scenario: Target platforms are a list
- **WHEN** a `Prompt` declares the platforms it targets
- **THEN** the value is a list `targetModels: PlatformId[]` (zero or more platforms), not a single
  optional platform

#### Scenario: Slash alias is optional and inert
- **WHEN** a `Prompt` is created without a `slug`
- **THEN** the record is valid with no alias, and the `slug` field carries no behavior in this slice
  (it is consumed only once insertion ships)

#### Scenario: Usage fields exist but are dormant
- **WHEN** a `Prompt` is created
- **THEN** `usageCount` and `lastUsedAt` are part of the model and are not mutated by parsing or by this
  slice

### Requirement: Template variable extraction

The system SHALL provide a pure `parseVariables(body)` function that returns the ordered, deduplicated
list of `PromptVar` declared by `{{…}}` tokens in the body. The function SHALL be total — it MUST never
throw, for any input string. A `{{…}}` token SHALL be recognized as a variable only when its trimmed
inner content has a non-empty name and contains no brace characters.

#### Scenario: Plain variable
- **WHEN** the body contains `{{topic}}`
- **THEN** the result includes `{ name: 'topic', type: 'text' }` with no `default`

#### Scenario: Variable with a default
- **WHEN** the body contains `{{tone = neutral}}`
- **THEN** the result includes `{ name: 'tone', type: 'text', default: 'neutral' }` (name and default
  trimmed)

#### Scenario: Select variable with options
- **WHEN** the body contains `{{audience = devs | execs | general}}`
- **THEN** the result includes `{ name: 'audience', type: 'select', options: ['devs','execs','general'],
  default: 'devs' }` (the first option is the default; option values are trimmed and empty segments are
  dropped)

#### Scenario: Duplicate names coalesce, ordered by first appearance
- **WHEN** the body contains `{{topic}}` before `{{tone}}` and then `{{topic = AI}}` again
- **THEN** the result has exactly two entries, ordered `topic` then `tone`, and `topic` carries
  `default: 'AI'` (the first occurrence fixes order; a later occurrence fills a field the first left
  unset)

#### Scenario: First non-empty field wins on conflict
- **WHEN** the body contains `{{topic = AI}}` and later `{{topic = ML}}`
- **THEN** the single `topic` entry keeps `default: 'AI'`

#### Scenario: Malformed and empty tokens yield no variable
- **WHEN** the body contains any of `{{}}`, `{{   }}`, `{{= x}}`, an unclosed `{{topic`, or a nested
  `{{a{{b}}`
- **THEN** none of these contribute a `PromptVar` (they are treated as literal text)

### Requirement: Template tokenization for rendering

The system SHALL provide a pure `tokenizeTemplate(body)` function that returns the body as an ordered
run of tokens — `text` runs and `var` tokens — derived from the same scan as `parseVariables`, so the
two never disagree about which spans are variables. Each `var` token SHALL expose the variable `name`
and the original `raw` token text. Spans that are not recognized as variables SHALL appear within `text`
tokens.

#### Scenario: Interleaved text and variables
- **WHEN** `tokenizeTemplate` is called on `Hi {{name}}, write about {{topic}}.`
- **THEN** it returns, in order: a `text` token `Hi `, a `var` token for `name`, a `text` token `,
  write about `, a `var` token for `topic`, and a `text` token `.`

#### Scenario: Malformed token stays text
- **WHEN** `tokenizeTemplate` is called on `a {{}} b`
- **THEN** the `{{}}` is part of a `text` token, and no `var` token is emitted

#### Scenario: Tokenizer agrees with the extractor
- **WHEN** both functions run on the same body
- **THEN** the set of distinct `var`-token names from `tokenizeTemplate` equals the set of `name`s from
  `parseVariables`

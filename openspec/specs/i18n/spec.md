# i18n Specification

## Purpose

The i18n capability defines how the extension renders its UI in the user's language. It resolves
the active locale from the browser with an English fallback, provides a typed message catalog with
named-parameter interpolation and locale-correct plural selection, ships German/French/Spanish/
Portuguese translations plus a development pseudo-locale for layout-expansion testing, and enforces
— via lint and a completeness check — that no user-facing string is hard-coded and that every
locale stays in sync with the English source of truth. It is a UI-only concern: the service worker
returns locale-neutral data and all formatting happens in the view.

## Requirements

### Requirement: Locale resolved from the browser with English fallback

The extension SHALL resolve the active UI locale from the browser environment, matching by primary
language subtag against the supported-locale set, and SHALL fall back to English (`en`) when no
supported locale matches. Resolution SHALL use the existing browser locale APIs only and SHALL NOT
request any new permission or make any network request.

#### Scenario: Browser locale matches a supported locale

- **WHEN** the browser UI language is a supported locale (e.g. `de`)
- **THEN** the UI renders in that locale

#### Scenario: Regional variant maps to its base locale

- **WHEN** the browser UI language is a regional variant of a supported locale (e.g. `de-AT`)
- **THEN** the UI renders in the base locale (`de`)

#### Scenario: Unsupported locale falls back to English

- **WHEN** the browser UI language is not in the supported-locale set (e.g. `ja`)
- **THEN** the UI renders in English

### Requirement: Supported locale set

The extension SHALL support English (`en`), German (`de`), French (`fr`), Spanish (`es`), and
Portuguese (`pt`) as production locales, plus a development/test pseudo-locale. English SHALL be the
source of truth from which all other catalogs derive their key set.

#### Scenario: Each production locale renders its own catalog

- **WHEN** the active locale is any of `en`, `de`, `fr`, `es`, `pt`
- **THEN** user-facing strings render from that locale's catalog

### Requirement: Typed message catalog with interpolation

The extension SHALL route all user-facing strings through a translation accessor that reads from a
typed message catalog. Messages with dynamic values SHALL use named parameters interpolated at
render time rather than string concatenation, so a translator owns each complete phrase. The
message key set SHALL be derived from the English catalog such that a missing or misspelled key in
any other locale is a build-time type error.

#### Scenario: A parameterized message interpolates its values

- **WHEN** a message with a named parameter is rendered with a value supplied
- **THEN** the rendered text contains the value in place of the parameter token
- **AND** no parameter token remains in the output

#### Scenario: A non-English catalog missing a key fails the type check

- **WHEN** a non-English catalog omits a key present in the English catalog
- **THEN** the type check fails

### Requirement: Per-key fallback to English

When the active catalog has no value (absent or empty) for a requested key, the accessor SHALL
return the English value for that key. It SHALL NOT render the raw key or an empty string for a
known message.

#### Scenario: Missing translation falls back to English text

- **WHEN** the active non-English catalog has no value for a key that exists in English
- **THEN** the rendered text is the English value for that key

### Requirement: Locale-correct plural selection and number/date formatting

Count-bearing messages SHALL select the correct plural form for the active locale using the
platform plural rules, and numbers, dates, and relative times SHALL be formatted using
locale-aware platform formatting. The UI SHALL NOT assemble plurals or number/date formats by
hand-written English-only logic.

#### Scenario: Plural form follows the active locale

- **WHEN** a count-bearing message is rendered with a count of 1 and again with a count of 2
- **THEN** each rendering uses the plural form the active locale's rules select for that count

#### Scenario: Relative time is localized

- **WHEN** a relative timestamp is rendered in a non-English locale
- **THEN** its units and formatting follow that locale

### Requirement: No hard-coded user-facing strings

User-facing text in the UI layer SHALL NOT be hard-coded as literals; it SHALL be routed through
the translation accessor. The build SHALL include a lint check that fails when a hard-coded
user-facing string literal is present in the UI source.

#### Scenario: A hard-coded UI string fails lint

- **WHEN** a user-facing string literal is added directly to UI markup instead of a catalog key
- **THEN** the lint check fails

### Requirement: Catalog completeness is enforced

The test suite SHALL verify that every locale catalog contains exactly the English key set — no key
present in English is missing from another locale, and no locale defines a key absent from English.

#### Scenario: An incomplete or orphaned-key catalog fails the check

- **WHEN** a locale catalog is missing an English key or defines a key not in English
- **THEN** the completeness check fails

### Requirement: Pseudo-locale expansion pass

The extension SHALL provide a development/test pseudo-locale derived from the English catalog that
lengthens each string by at least ~30% and visibly brackets it, without altering parameter tokens.
A test SHALL render the UI in the pseudo-locale and assert that layout tolerates the expansion
without clipping or overflow (D21).

#### Scenario: Pseudo-locale preserves parameter tokens

- **WHEN** a parameterized message is rendered in the pseudo-locale
- **THEN** its parameter tokens are intact and still interpolate

#### Scenario: Layout tolerates expanded text

- **WHEN** the UI is rendered in the pseudo-locale
- **THEN** navigation, segmented controls, chips, and badges show no clipped or overflowing text

### Requirement: Translation is UI-only

Locale resolution and message formatting SHALL occur in the UI layer. The service worker SHALL
return locale-neutral data (identifiers, counts, ISO timestamps) and SHALL NOT perform translation.
Dynamic user content (prompt bodies, conversation titles) SHALL NOT be translated.

#### Scenario: Worker payloads carry no localized copy

- **WHEN** the UI requests data from the service worker
- **THEN** the response contains locale-neutral values that the UI formats for the active locale

#### Scenario: User content is never translated

- **WHEN** the UI renders a user-authored conversation title or prompt body
- **THEN** the content is shown verbatim regardless of the active locale

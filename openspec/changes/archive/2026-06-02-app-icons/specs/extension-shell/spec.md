## ADDED Requirements

### Requirement: Extension branding icons

The built extension SHALL declare branding icons in its manifest so it presents the Skeinos
mark — rather than the browser default — in the install dialog, the extensions management
page, the Web Store/AMO listing, and the browser toolbar. The manifest's extension `icons`
map SHALL include at least the 16, 32, 48, and 128 px sizes, each referencing a valid PNG
bundled in the package.

#### Scenario: Manifest declares required icon sizes

- **WHEN** the generated manifest is inspected
- **THEN** `icons` is present
- **AND** it includes entries for sizes 16, 32, 48, and 128
- **AND** each referenced icon file exists in the build output

#### Scenario: Icon files are valid PNGs of the declared dimensions

- **WHEN** each file referenced by `icons` is read
- **THEN** it is a valid PNG
- **AND** its pixel dimensions match the declared size key

### Requirement: Branded toolbar action

The extension SHALL declare a toolbar `action` so a branded button appears in the browser
toolbar. The action SHALL carry a human-readable title and SHALL resolve to the Skeinos icon
(via its own `default_icon` or by falling back to the extension `icons`). The action's click
behaviour is out of scope for this capability and MAY be a no-op.

#### Scenario: Toolbar action is declared with a title

- **WHEN** the generated manifest is inspected
- **THEN** an `action` block is present
- **AND** it declares a non-empty `default_title`

#### Scenario: Toolbar button resolves to a branding icon

- **WHEN** the action is rendered in the toolbar
- **THEN** it displays the Skeinos icon, sourced from `action.default_icon` when present or
  from the extension `icons` map otherwise

### Requirement: Theme-adaptive toolbar icon on Firefox

The Firefox build of the extension SHALL provide `theme_icons` so the toolbar icon adapts to
light and dark browser themes, using monochrome glyph variants.

#### Scenario: Firefox manifest declares theme_icons

- **WHEN** the manifest generated for the Firefox target is inspected
- **THEN** `theme_icons` is present
- **AND** it pairs a light-theme and a dark-theme icon for at least one size
- **AND** each referenced glyph file exists in the build output

### Requirement: Extension pages reference a favicon

Pages owned by the extension (the options/settings page) SHALL reference a bundled favicon so
the browser tab shows the Skeinos mark instead of a blank icon.

#### Scenario: Options page links a favicon

- **WHEN** the options page HTML is inspected
- **THEN** it contains a `<link rel="icon">` referencing a bundled icon asset
- **AND** that asset exists in the build output

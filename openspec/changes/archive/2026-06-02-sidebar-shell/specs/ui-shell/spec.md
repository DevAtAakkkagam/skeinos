## ADDED Requirements

### Requirement: Bundled design-system typefaces

The overlay SHALL render in the Lattice Design System typefaces — Urbanist for UI /
titles / body, Handjet for dot-matrix overlines and labels, and Spline Sans Mono for
monospace — exposed as the `--sk-font-ui`, `--sk-font-dot`, and `--sk-font-mono`
tokens. The font data SHALL be bundled with the extension (no remote code or network
fetch) and registered with the document font set via the FontFace API — which the
shadow DOM inherits — so glyphs render identically across hosts and operating systems
regardless of locally-installed fonts. (A `@font-face` declared inside the shadow root
would be ignored by the browser, so registration is at the document level.)

#### Scenario: Fonts render from bundled data, not the host or OS

- **WHEN** the overlay mounts
- **THEN** the bundled faces for Urbanist, Handjet, and Spline Sans Mono are registered with the document font set
- **AND** a shadow-root element styled with the dot-font token resolves its computed font family to Handjet

#### Scenario: No remote font fetch

- **WHEN** the overlay loads
- **THEN** the fonts are served from bundled extension data (data-URI), not fetched from a remote origin

## MODIFIED Requirements

### Requirement: Minimum host permissions

The extension SHALL request host permissions only for the supported launch platforms (claude.ai, gemini.google.com, perplexity.ai, chatgpt.com) and SHALL NOT request broad (`<all_urls>`) host access or any permission granting access to user credentials.

#### Scenario: Only supported hosts are requested

- **WHEN** the generated manifest's host permissions are inspected
- **THEN** the host match patterns cover only the supported launch platforms
- **AND** no `<all_urls>` pattern is present

#### Scenario: No credential-bearing permissions

- **WHEN** the manifest permission list is inspected
- **THEN** it contains no permission that grants access to cookies, passwords, or other host credentials

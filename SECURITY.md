# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security or privacy vulnerability.**

Report it privately in either of these ways:

- [GitHub private vulnerability reporting](https://github.com/aakkagam/skeinos/security/advisories/new) (preferred)
- Email **admin@aakkagam.com** with `SECURITY` in the subject

Please include what you found, how to reproduce it, which version and browser, and what
you think the impact is. A rough proof of concept helps a lot.

You'll get an acknowledgement within **72 hours** and an assessment within **7 days**. This
is a small project, so there is no bounty — but you'll get credit in the release notes and
the advisory unless you'd rather stay anonymous.

Please give a fix a reasonable window before disclosing publicly. If a report goes
unanswered past the windows above, disclose it — silence is not a reason to sit on a real
problem.

## What counts as a vulnerability here

Skeinos runs on pages where you are logged into an AI chat service, so the interesting
classes are:

- **Anything that sends conversation content, titles, or the search index off the device.**
  This is the project's core promise. A path that leaks any of it — including through a
  bundled dependency, an error message, or a log — is the most severe class of bug here.
- Cross-site scripting through content rendered in the extension's shadow-DOM panel,
  particularly from host-page content (conversation titles and message text are attacker-
  influenceable if a chat site is compromised or a user pastes hostile content).
- Anything that lets a web page reach the extension's storage, message the service worker
  as if it were the extension, or escalate the extension's privileges.
- Adapter config loading that could be abused to execute code or widen host access. Remote
  configs are *data*, schema-validated, and never code — a way around that validation is a
  vulnerability.
- A path that reads credentials, cookies, or auth tokens from a host page. The extension
  requests no credential-bearing permissions and never touches these.

## Not vulnerabilities

- **A chat site changed its DOM and the panel broke.** That's expected breakage, handled by
  design — the panel self-checks, disables itself, and shows a banner. Please open a normal
  issue (there's a template for it) or send a pull request with the fixed selector.
- Reports that the extension can read the page it's mounted on. That's what it does: it
  reads the DOM of a page you are already logged into and viewing, which is the same access
  you have. Host permissions are limited to the four supported chat sites.
- Vulnerabilities in the chat sites themselves. Report those to the site.
- Findings from automated scanners with no demonstrated impact.

## Supported versions

Only the latest released version gets fixes. Update through the Chrome Web Store or
Firefox Add-ons.

## Verifying the privacy claims

You don't have to trust a policy document. The extension makes exactly one kind of
outbound request — a plain `GET` for a public adapter-config JSON, with no body, no
identifiers, and no cookies. To check:

```bash
grep -rn "fetch(\|XMLHttpRequest\|sendBeacon\|WebSocket" extension/src
```

Then load the extension, open devtools → Network, and use it for a while. If you find a
request carrying anything of the user's, that's a security report — please send it.

# Changelog

User-facing changes per released version. Bullets are written store-ready:
the publish workflow prints the current version's section in its run summary,
to be pasted into the Chrome Web Store description's "WHAT'S NEW" section
(overwrite the previous one) and the Firefox AMO version release notes.

## 0.1.6 — 2026-07-26

• ChatGPT: Skeinos now indexes your full conversation history on first visit, instead of only the chats ChatGPT had already loaded into its sidebar — folders, tags, and search finally see everything.
• Skeinos sends nothing off your device. The optional diagnostics stream is gone entirely, along with its settings toggle.
• Skeinos is now open source (GPL-3.0) — the full extension source is public at github.com/aakkagam/skeinos, and Settings has a "Source code" link so you can go read it.

## 0.1.5 — 2026-07-18

• Skeinos can now repair chat-site compatibility breakages remotely — no store update needed when a site changes its layout.
• Rebuilt Claude support for Claude's July 2026 interface redesign.
• Fixed: the Perplexity sidebar attaches correctly again after a recent site update.
• Fixed: stray icon characters no longer appear in conversation titles.
• Fixed: conversation lists keep the chat site's own most-recent-first order.

## 0.1.4 — 2026-07-06

• Welcome page after install — a quick tour of the sidebar, search, and prompt library, in all 5 languages.
• "Send feedback" link in the sidebar and options page.
• Fixed: selecting multiple tags in the folder filter now shows conversations matching ANY selected tag (previously required all of them).

## 0.1.3 — 2026-06-27

• Skeinos now notices when you're signed out of a chat site and pauses instead of showing an empty list.
• Friendlier empty state in the sidebar when a site has no conversations yet.
• First Firefox release.

## 0.1.2 — 2026-06-26

• First public release: folders, search, prompt library, instruction profiles, and tags across Claude, ChatGPT, Gemini, and Perplexity.

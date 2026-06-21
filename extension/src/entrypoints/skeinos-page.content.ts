import { P0_MATCHES } from '../manifest.config';
import { installComposerBridge } from '../adapters/runtime/composer-bridge';

// A minimal content script that runs in the page's MAIN world (Chrome 111+) so it can
// reach page-script state the isolated content script cannot — currently the Lexical
// editor instance needed to clear Perplexity's composer (see composer-bridge.ts).
// It grants no DOM/permission reach beyond the isolated script (same `matches`); it
// only listens for our own event and acts on the composer the user already targeted.
// `document_start` so the listener exists before the user can trigger a clear.
export default defineContentScript({
  matches: [...P0_MATCHES],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installComposerBridge();
  },
});

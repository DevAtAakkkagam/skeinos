import { P0_MATCHES } from '../manifest.config';
import { runContent } from '../content';

export default defineContentScript({
  matches: [...P0_MATCHES],
  main() {
    void runContent();
  },
});

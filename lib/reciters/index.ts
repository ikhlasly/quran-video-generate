import type { ReciterProvider } from './provider';
import { AlQuranProvider } from './alquran-provider';
import { QuranPediaProvider } from './quranpedia-provider';
import { ReciterService } from './reciter-service';

export type { ReciterProvider } from './provider';
export { AlQuranProvider } from './alquran-provider';
export { QuranPediaProvider } from './quranpedia-provider';
export { ReciterService } from './reciter-service';
export {
  fetchJsonWithRetry,
  normalizeReciterName,
  normalizeServerUrl,
  pad3,
  classifyMoshafType,
} from './provider';

/**
 * Process-wide singleton reciter service.
 *
 * Using a module-level singleton means the in-memory cache is shared across
 * all API route invocations within the same Node.js process, dramatically
 * reducing upstream API calls. The cache TTL (10 minutes) balances freshness
 * with upstream load.
 */
let _service: ReciterService | null = null;

export function getReciterService(providers?: ReciterProvider[]): ReciterService {
  if (!_service) {
    _service = new ReciterService(
      providers ?? [new AlQuranProvider(), new QuranPediaProvider()],
    );
  }
  return _service;
}

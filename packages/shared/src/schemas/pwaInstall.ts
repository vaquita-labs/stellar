import { z } from 'zod';

import { PWA_INSTALL_PLATFORMS } from '../services/pwaInstalls/pwaInstalls';

/**
 * What a client may report about running as an installed app.
 *
 * The wallet is not in here: it comes from the session, so the body has nothing
 * to falsify. `platform` is the client's own reading of its user agent, because
 * only the client can tell an iPad from a Mac (iPadOS reports itself as a Mac
 * with touch), and it is a closed set so a stray value cannot invent a bucket.
 */
export const pwaInstallSchema = z.object({
  platform: z.enum(PWA_INSTALL_PLATFORMS as [string, ...string[]]),
});

export type PwaInstallPayload = z.infer<typeof pwaInstallSchema>;

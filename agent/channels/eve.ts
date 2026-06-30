import { eveChannel } from "eve/channels/eve";
import { none } from "eve/channels/auth";

/**
 * Eve HTTP channel for the Hugo Labs showcase agent.
 *
 * Access is gated UPSTREAM by the Next.js middleware (`proxy.ts`), which
 * requires an authenticated app session before any `/eve/v1/*` request is
 * rewritten to this runtime. The channel itself therefore uses `none()` so the
 * already-authorized, same-origin proxied request is accepted in production
 * (the default `vercelOidc()/localDev()` policy would 401 a browser user).
 *
 * Safe by construction: the agent only exposes its own clock/calculator tools —
 * every filesystem/shell/web/subagent tool from the default harness is disabled
 * in `agent/tools/*`.
 */
export default eveChannel({
  auth: [none()],
});

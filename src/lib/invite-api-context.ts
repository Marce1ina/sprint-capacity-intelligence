import { SprintInviteService } from "@/lib/services/sprint-invite-service";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * The one place the invite flow needs cross-user (service-role) access — the
 * invitee is never `invited_by`, so the normal RLS-scoped client can't read or
 * consume their invite row. Every public invite route should go through this
 * helper rather than importing `createAdminClient` directly.
 */
export function resolveInviteAdminService(): SprintInviteService | null {
  const adminClient = createAdminClient();
  if (!adminClient) {
    return null;
  }
  return new SprintInviteService(adminClient);
}

// Phase 4 — Per-item Share (additive). An explicit, revocable grant lets a specific
// grantee READ one specific record. This is the ONLY path that can expose a
// SensitiveRecord (reflection / self-care) to a non-owner — and only that one item,
// read-only, never List/Update/Delete.
//
// The router populates `resource.sharedWith` per-request from the loaded Share
// mirror-item for exactly (principal, resource) — spec-backend-dynamodb.md §4.5. A grant
// for a different record never appears in this resource's `sharedWith`, so it cannot leak.
// Every allow here is a non-owner access and is audited (§4.6).
permit (
  principal,
  action == NursePlanner::Action::"Read",
  resource
)
when {
  resource has sharedWith &&
  resource.sharedWith.contains(principal)
};

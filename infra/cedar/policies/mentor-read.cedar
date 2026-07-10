// Phase 4 — Mentorship (additive). A mentor may Read/List a student's EVIDENCE records
// only — never a SensitiveRecord (reflections / self-care). That tier has no `mentors`
// attribute in the schema at all, so this policy is STRUCTURALLY unable to reach it; the
// `resource is EvidenceRecord` scope is belt-and-braces. Read/List only — no mutation.
//
// The router populates `resource.mentors` per-request from the loaded Mentorship
// mirror-item records for (principal, resource.owner) — spec-backend-dynamodb.md §4.5.
// Every allow here is a non-owner access and is audited (§4.6).
permit (
  principal,
  action in [NursePlanner::Action::"Read", NursePlanner::Action::"List"],
  resource
)
when {
  resource is NursePlanner::EvidenceRecord &&
  resource has mentors &&
  resource.mentors.contains(principal)
};

// v1 policy — the owner can perform any action on records they own.
//
// spec-backend-dynamodb.md §4.3 states this as `permit(principal, action, resource)
// when { resource.owner == principal }`. We add a `resource has owner` guard so the
// policy also type-checks under STRICT schema validation: the reserved `Reference`
// tier carries no `owner` attribute (its reads are covered by reference-read.cedar),
// and the guard makes that explicit. Semantically identical for the two owned tiers
// (SensitiveRecord, EvidenceRecord).
permit (principal, action, resource)
when { resource has owner && resource.owner == principal };

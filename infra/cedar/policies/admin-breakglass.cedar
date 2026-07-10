// Phase 4 — Admin break-glass (additive). Members of the `admins` Cognito group (mapped
// to the Cedar group NursePlanner::Group::"admins" via the AVP identity source's
// groupConfiguration) may act on any record — support / break-glass.
//
// Group membership is HUMAN-MANAGED ([YOU]: define the admin Cognito group). Every allow
// here is a non-owner access and MUST be audited with a reason string (§4.6). This is the
// broadest grant in the system — review carefully before shipping.
//
// The pool-id placeholder in the group id below is substituted with the environment's
// Cognito user pool id by the Authz construct at deploy: AVP's Cognito identity source
// names a group entity `<userPoolId>|<groupName>` (same prefixing as the
// `<userPoolId>|<sub>` principal id), so a bare group name would never match. Verified live.
permit (
  principal in NursePlanner::Group::"__USER_POOL_ID__|admins",
  action,
  resource
);

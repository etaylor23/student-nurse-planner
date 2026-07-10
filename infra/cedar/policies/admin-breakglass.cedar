// Phase 4 — Admin break-glass (additive). Members of the `admins` Cognito group (mapped
// to the Cedar group NursePlanner::Group::"admins" via the AVP identity source's
// groupConfiguration) may act on any record — support / break-glass.
//
// Group membership is HUMAN-MANAGED ([YOU]: define the admin Cognito group). Every allow
// here is a non-owner access and MUST be audited with a reason string (§4.6). This is the
// broadest grant in the system — review carefully before shipping.
permit (
  principal in NursePlanner::Group::"admins",
  action,
  resource
);

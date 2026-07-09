// Reserved policy — any authenticated user may Read global reference data.
//
// INERT in v1: reference data (proficiencies, Annexe-B skills, baseline subjects,
// default break-rules) is bundled in the client and served locally by ApiRepository,
// so no `Reference` resources are served by the API yet
// (spec-backend-dynamodb.md §2.4, §4.3). Kept so the drop-in upgrade to a server-side
// GLOBAL partition needs no policy change.
permit (
  principal,
  action == NursePlanner::Action::"Read",
  resource
)
when { resource is NursePlanner::Reference };

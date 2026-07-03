import { useLocation, useNavigate } from "react-router-dom";
import { Panel } from "../ui";
import { ReflectionEditor } from "./ReflectionEditor";

/** The `/reflection/new` route. Seeds an optional shift from a debrief/editor CTA and,
 * on save, lands on the new reflection's detail with a golden-moment confirmation. */
export function NewReflectionPage() {
  const navigate = useNavigate();
  const state = useLocation().state as {
    prefillShiftId?: string;
    prefillTitle?: string;
    prefillTags?: string[];
  } | null;
  return (
    <Panel title="New reflection" hint="Gibbs reflective cycle — guided prompts">
      <ReflectionEditor
        prefillShiftId={state?.prefillShiftId}
        prefillTitle={state?.prefillTitle}
        prefillTags={state?.prefillTags}
        onSaved={(id) => navigate(`/reflection/${id}`, { state: { justCreated: true } })}
        onCancel={() => navigate("/reflection")}
      />
    </Panel>
  );
}

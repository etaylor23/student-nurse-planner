import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { skillCategories } from "../../../logic/skills";
import { useSkills } from "../../hooks";
import { useSkillActions } from "../../useSkillActions";
import { Autocomplete } from "../medications/Autocomplete";
import { Panel, btnGhost, btnPrimary, inputCls } from "../ui";

/** Add a student's own custom skill, on top of the Annexe B baseline. */
export function SkillFormPage() {
  const { skills, reload } = useSkills();
  const { addCustomSkill } = useSkillActions();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const categories = useMemo(() => skillCategories(skills), [skills]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    const created = await addCustomSkill({
      name: name.trim(),
      category: category.trim() || "Custom skills",
    });
    await reload();
    navigate(created ? `/skills/${created.id}` : "/skills");
  };

  return (
    <div className="space-y-6">
      <Link to="/skills" className="text-sm font-medium text-emerald-700">
        ← All skills
      </Link>

      <Panel
        title="Add a custom skill"
        hint="Adds to the Annexe B baseline — track stages and sign-off the same way"
      >
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Skill name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="e.g. Insulin pump set-up"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Category</span>
            <Autocomplete
              value={category}
              onChange={setCategory}
              options={categories}
              placeholder="Pick an existing category or type a new one"
              ariaLabel="Category"
            />
            <span className="mt-1 block text-xs text-slate-400">
              Groups the skill in the list. Defaults to “Custom skills”.
            </span>
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={!name.trim() || saving} className={btnPrimary}>
              Add skill
            </button>
            <Link to="/skills" className={btnGhost}>
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
    </div>
  );
}

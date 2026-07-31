/**
 * "Worth a check" — the one badge for anything the app is not sure about.
 *
 * Shared rather than restyled per site, so the shift bar's low-confidence guess (P9) and a
 * block's disputed reading (P22) look identical: both mean "we could be wrong here, have a
 * look". Two different treatments for the same idea taught the student two things to learn
 * instead of one.
 *
 * A pill, not a heading: a two-word label in a narrow lane column wrapped to two lines and
 * read as a section title rather than a flag.
 */
export function WorthACheck() {
  return (
    <span className="inline-block whitespace-nowrap rounded-full bg-accent-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-700">
      worth a check
    </span>
  );
}

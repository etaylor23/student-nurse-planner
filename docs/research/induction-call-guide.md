# Induction call guide — the calls are the discovery interviews

**Written:** 2026-08-17 · **For:** Ellis (and Nicola, where she joins) ·
**Context:** the `intelligence-capture` email sent 2026-08-17 asks all six beta students to
reply to hello@placemate.uk to book an induction call.

The call has two jobs and they are in tension. Job one is the one you promised: **get them
set up and using the app.** Job two is the one you need: **find out what placement is
actually like.** Do them in that order. A student who leaves the call still confused about
sign-in learned nothing and taught you nothing.

Target shape: **35–40 minutes.** 5 warm-up · 10 set-up · 20 discovery · 5 close.
If it runs long, cut discovery, not set-up.

Everything below tests a hypothesis from
[`student-nurse-pain-points.md`](student-nurse-pain-points.md) §6. The domain terms are
explained in [`student-nurse-domain-primer.md`](student-nurse-domain-primer.md).

---

## Before the call

- **Know which PAD they use.** Pan London ePAD, MYEPAD/PebblePad, Online PARE, All Wales, or
  paper. It changes half the answers. If you can find out from their university beforehand,
  do; otherwise it's question 1.
- **Know their field and part.** Adult / mental health / LD / children's, and Part 1, 2 or 3.
  A Part 1 student in their first placement and a Part 3 student six months from
  registration have almost nothing in common.
- **Check whether they've ever signed in.** We can't attribute sign-ins yet, and nobody has
  any DynamoDB rows. Assume no.
- **Have the app open** on the same screen you'll ask them to use, on a phone.

### Consent, said plainly

Say this out loud at the top, and don't skip it because it feels awkward:

> "Two quick things. I'd like to take notes so I don't misremember — is that OK? And nothing
> you tell me goes anywhere with your name on it; if I quote you to anyone it'll be 'a
> second-year said'. Also — please don't tell me anything about a specific patient. If a
> story needs a patient in it, keep them anonymous."

That last sentence is not box-ticking. You are asking a student about their clinical notes.
Their duty of confidentiality is real and you must be visibly on the right side of it.

If Nicola is on the call, introduce her as the RN co-founder early — it changes how freely
they talk about wards.

---

## Part 1 — warm-up (5 min)

Low stakes, gets them talking, and every answer is data.

1. "Where are you at — which year, which field, and where are you on placement right now?"
2. "What's the ward like? Are you enjoying it?"
3. "How did you hear about PlaceMate?" *(There were nine 'User not found' sign-in attempts
   between 21 Jul and 3 Aug — people we never provisioned, trying to get in. We don't know
   how many distinct people that is. Someone is talking; find out who.)*

---

## Part 2 — set-up (10 min)

Do this live, on their phone, while you watch.

- Send the magic link during the call and watch them open it. **Note every hesitation** —
  where their thumb stops is a bug report.
- Get **one real shift** in. Not a demo shift. A real one from this week.
- Get **one photo captured and reviewed**. This is the feature the email announced; if it
  doesn't work on their phone, on their network, everything else is moot.
- Watch for the known hazards: NHSmail Safe Links mangling the magic link (Darlene),
  hospital Wi-Fi blocking placemate.uk (the UCLH filter was due to age out ~9 Aug 2026 —
  unverified).

**Do not talk while they do it.** Silence is the instrument. Note what they try first and
what they expect to happen.

---

## Part 3 — discovery (20 min)

Ask these as a conversation, not a list. If one thread gets hot, follow it and drop the rest
— one vivid true story beats six shallow answers.

### A. The shift-to-record journey — the core unknown

> **"Walk me through your last shift. Start from arriving on the ward and take me through to
> going to bed. Don't skip the boring bits."**

Then, specifically:

- "When in that day did you write anything down? What on?"
- "What happened to what you wrote?"
- "When did you last touch your PAD — was it that night, that week, or later?"
- "How do your hours get on there? Who signs them, and when?"

**Listening for (H2, the hours window):** do they get hours approved daily, as the ePAD guide
instructs? Or do they batch them up? Have they ever hit the grace period and lost hours, or
had to ask an assessor to fix an entry they couldn't fix themselves?

### B. The thing that went nowhere

> **"What did you write down last week that went nowhere?"**

Then: "Do you have a notebook? Can you describe what's in it — not the contents, just what
kind of thing?" and "Is there stuff in there you know should have gone into the PAD and
didn't?"

**Listening for (the duplication hypothesis, currently unevidenced):** is there genuinely a
second act of writing-up, or does the note die and never get re-entered anywhere? Those are
different products.

### C. The sign-off

> **"Tell me about getting something signed off. Pick one proficiency and tell me the story
> of how it got signed."**

- "How did you decide you were ready to ask?"
- "How did you get hold of your assessor?"
- "What did they actually ask you for — a conversation, watching you do it, doing it on your
  own?"
- "Has a different assessor wanted something different for the same kind of thing?"
- "Have you ever been signed off for something you didn't feel ready for?"

**Listening for (H1, the choke point):** whether the pain is finding the assessor, knowing
the bar, or marshalling evidence. Those are three different features. The Kiilu study says
all three; find out which dominates for *them*.

### D. The weight

> **"What's the bit of all this that sits on you when you're trying to sleep?"**

And, if it doesn't come up naturally:

- "Do you ever find the proficiencies pull your attention away from just being on the ward?"
  *(H3 — a near-direct quote from the research; if they agree unprompted, that's a strong
  signal.)*
- "What are you least confident about clinically?" *(H4 — expect meds and calculations.)*
- "Do you feel like you belong on the ward you're on?" *(Ask gently, late, and only if the
  rapport is there. 52% of students cite an unwelcoming atmosphere.)*

### E. The counterfactual

> **"If I could magic one thing away from your week, what would you pick?"**

And the sharper version:

> **"If PlaceMate vanished tomorrow, would you notice?"**

Ask it. The answer from a beta student with zero rows of data is the most useful sentence
you'll hear all month, and it's better to hear it now than infer it from silence.

---

## Part 4 — close (5 min)

- "Is there anything I should have asked and didn't?"
- Agree **one concrete thing** they'll do before you next speak: log this week's shifts,
  photograph one page of notes. Small, specific, theirs.
- Ask whether they'd be up for a 10-minute follow-up in three weeks.
- **Ask for the referral:** "Is there someone on your cohort who'd find this useful?" People
  we never invited are already trying to sign in. There's latent demand; ask for it directly.

---

## Question hygiene

The whole value of these calls depends on not leading. Six rules:

1. **Ask about the last time, not about generally.** "What did you do after your last shift?"
   not "What do you usually do after a shift?" Memory of specifics is reliable; self-report
   of habits is not.
2. **Never describe a feature and ask if they'd use it.** They will say yes. They are being
   polite to the person who gave them a free app.
3. **Ask what they do, then ask what it cost them.** Behaviour, then pain. Not "is X
   annoying?"
4. **Chase the emotional words.** "Stressful", "a nightmare", "I hate" — stop and ask "tell
   me about a time that happened."
5. **Silence for three seconds** after they finish. The second sentence is the honest one.
6. **Don't defend the app.** If they criticise it, say "that's really useful, tell me more."
   Every defence costs you the next criticism.

---

## Capture

Write up within an hour, while it's fresh, into `docs/research/calls/<name>-<date>.md`. Keep
it thin and consistent:

```
Who:        <name>, year, field, university, PAD system
Placement:  setting, week N of M
Set-up:     did the magic link work / did a shift get logged / did a photo parse
Journey:    their shift-to-record story, in their words
Quotes:     verbatim only, no paraphrase
Hypotheses: H1 sign-off choke / H2 hours window / H3 displacement / H4 confidence
            — supported / contradicted / not raised
Surprise:   the one thing I did not expect
Ask:        what they said they'd do next
```

**The "Surprise" line is the point of the whole exercise.** Four calls with nothing in that
field means the questions are too leading. And log the send/contact in
`docs/runbooks/beta-recipients.md` as usual.

---

## After three or four calls

Come back to [`plans/2026-08-17-next-direction.md`](../../plans/2026-08-17-next-direction.md)
and score the three candidate directions against what you actually heard. Do not pick a
direction before the calls; do not defer picking one until all six have happened, because
some of them won't.

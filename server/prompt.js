// Drafting prompt + content policy, plus the mock generator used when no
// ANTHROPIC_API_KEY is configured.

export const PLATFORM_LABELS = {
  twitter: 'Twitter/X post',
  linkedin: 'LinkedIn post',
  instagram: 'Instagram caption',
  blog: 'short blog post',
}

// The content policy is embedded directly in the system prompt so the model
// refuses disallowed content at generation time.
export const CONTENT_POLICY = `CONTENT POLICY (must be followed):
- You draft ORIGINAL social/marketing content only. A human reviews and must
  explicitly approve every post before anything is published.
- REFUSE to generate: disinformation or misleading claims; content that
  impersonates a real person, brand, or organization; fabricated statements
  presented as news or fact; fake quotes, fake statistics, or invented events
  presented as real.
- Do not invent specific facts, numbers, dates, or quotes. If the user's topic
  seems to require a factual claim, write it so the human can fill in / verify
  the specifics, or keep it clearly general.
- If a request asks for any of the above disallowed content, do not comply.
  Instead return a single variant whose text politely explains you can only
  help draft honest, original content.`

export function buildSystemPrompt() {
  return `You are DraftDeck, an assistant that writes DRAFT social media and blog posts for a human to review, edit, and approve. You never publish anything yourself.

${CONTENT_POLICY}

OUTPUT FORMAT: Respond with ONLY a JSON object of the form:
{"variants": ["draft text 1", "draft text 2"]}
Return between 1 and 3 variants. Each variant is the full post text, ready for a human to review. No markdown fences, no commentary outside the JSON.`
}

export function buildUserPrompt({ platform, topic, tone }) {
  const label = PLATFORM_LABELS[platform] || 'social post'
  const toneLine = tone ? `Tone: ${tone}.` : 'Tone: natural and appropriate for the platform.'
  return `Draft ${label} content.
${toneLine}
Topic / description: ${topic}

Produce 1-3 distinct draft variants following the content policy and the JSON output format.`
}

// Realistic mock variants so the app is fully usable with zero setup.
export function mockVariants({ platform, topic, tone }) {
  const t = (topic || 'your topic').trim()
  const toneTag = tone ? ` (${tone})` : ''
  switch (platform) {
    case 'twitter':
      return [
        `Quick thought on ${t}${toneTag}: the small, consistent moves compound faster than the big dramatic ones. What's one small move you're making this week? 🧵`,
        `We've been heads-down on ${t} and learned one thing the hard way: ship the rough version, then improve it in public. Perfectionism is just procrastination in a nicer outfit.`,
        `${t}, in one line: start before you feel ready, and let the work teach you the rest.`,
      ]
    case 'linkedin':
      return [
        `A reflection on ${t}${toneTag}.\n\nMost progress doesn't come from a single breakthrough — it comes from showing up and iterating when it isn't glamorous.\n\nThree things that helped us:\n1. Define what "done" looks like early.\n2. Get feedback before you're proud of the work.\n3. Keep a human in the loop for anything that ships.\n\nWhat has worked for your team?`,
        `I used to think ${t} required having all the answers up front. It doesn't.\n\nIt requires a clear first step, honest feedback, and the discipline to revise. The teams I admire most aren't the ones who never get it wrong — they're the ones who correct quickly and in the open.\n\nCurious how others approach this.`,
      ]
    case 'instagram':
      return [
        `${t} ✨${toneTag}\n\nSaving this as a reminder: progress > perfection. Drop a 💬 if you needed to hear that today.\n\n#growth #behindthescenes #keepgoing`,
        `Behind the scenes of ${t} 👀\n\nThe messy middle is where the real work happens. Tag someone who's in it right now. 💛\n\n#process #community #smallwins`,
      ]
    case 'blog':
      return [
        `# Notes on ${t}\n\nThere's a quiet myth that meaningful work arrives fully formed. In practice, it almost never does. The useful version of ${t} tends to start small, get tested against reality, and improve through revision.\n\nIn this post I want to share a simple, repeatable approach: pick a clear first step, gather honest feedback early, and keep a human reviewer in the loop before anything goes out the door.\n\n(Draft — review, edit, and add your own specifics before publishing.)`,
        `# A practical take on ${t}\n\nIf you've been waiting for the perfect moment to tackle ${t}, this is your nudge to start rough. Below is a lightweight framework you can adapt to your own context — no grand claims, just a process that holds up.\n\n(Draft — replace placeholders with verified details before publishing.)`,
      ]
    default:
      return [`Draft about ${t}${toneTag}. Review and edit before publishing.`]
  }
}

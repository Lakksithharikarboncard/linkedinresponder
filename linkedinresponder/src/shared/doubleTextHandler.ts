export interface DoubleTextPattern {
  firstMessage: string;
  secondMessage: string;
  delayMs: number;
  pattern: string;
}

type Context = { messageCount: number; lastMessageQuestions: number };

export function shouldDoubleText(reply: string, ctx: Context): boolean {
  const isLong = reply.split(" ").length > 40;
  const theyAskedQuestions = ctx.lastMessageQuestions > 0;
  return isLong || theyAskedQuestions;
}

export function generateDoubleText(originalReply: string, ctx: Context): DoubleTextPattern | null {
  const patterns = [tryPriceBreakdown, tryAfterThought, tryQuestionRefinement, tryEmojiFollowup];
  for (const pattern of patterns) {
    const result = pattern(originalReply);
    if (result) return result;
  }
  return null;
}

function tryPriceBreakdown(reply: string): DoubleTextPattern | null {
  const sentences = reply.split(/[.!?]/).filter((s) => s.trim());
  if (sentences.length < 3) return null;
  const splitPoint = Math.floor(sentences.length / 2);
  const first = sentences.slice(0, splitPoint).join(". ").trim();
  const second = sentences.slice(splitPoint).join(". ").trim();
  if (first.length < 20 || second.length < 10) return null;
  return {
    firstMessage: first,
    secondMessage: second,
    delayMs: 3000 + Math.random() * 4000,
    pattern: "price_breakdown",
  };
}

function tryAfterThought(reply: string): DoubleTextPattern | null {
  const sentences = reply.split(/[.!?]/).filter((s) => s.trim());
  if (sentences.length < 2) return null;
  const first = sentences[0].trim();
  const rest = sentences.slice(1).join(". ").trim();
  const prefixes = ["Quick note:", "Also,", "One more thing:"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  return {
    firstMessage: first,
    secondMessage: `${prefix} ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`,
    delayMs: 5000 + Math.random() * 3000,
    pattern: "afterthought",
  };
}

function tryQuestionRefinement(reply: string): DoubleTextPattern | null {
  if (!reply.includes("?")) return null;
  if (!reply.trim().endsWith("?")) return null;
  const refinements = ["No rush—ballpark is fine.", "Roughly is okay.", "Just an estimate works."];
  return {
    firstMessage: reply.trim(),
    secondMessage: refinements[Math.floor(Math.random() * refinements.length)],
    delayMs: 1800 + Math.random() * 1200,
    pattern: "question_refinement",
  };
}

function tryEmojiFollowup(reply: string): DoubleTextPattern | null {
  if (reply.split(" ").length > 15) return null;
  if (/[.!?]$/.test(reply.trim())) return null; // don’t add emoji if already punctuated
  const affirmatives = [/^(yeah|yes|yep|sure|sounds good|makes sense|got it|perfect)/i];
  const isAffirmative = affirmatives.some((p) => p.test(reply));
  if (!isAffirmative) return null;
  const emojis = ["👍", "👌", "✅"];
  return {
    firstMessage: reply.trim(),
    secondMessage: emojis[Math.floor(Math.random() * emojis.length)],
    delayMs: 1500 + Math.random() * 1500,
    pattern: "emoji_followup",
  };
}

export function calculateDoubleTextDelay(pattern: string): number {
  const base: Record<string, number> = {
    price_breakdown: 3000,
    afterthought: 5000,
    question_refinement: 1800,
    emoji_followup: 1500,
  };
  const v = base[pattern] ?? 3000;
  const variance = v * 0.4;
  return v + (Math.random() - 0.5) * 2 * variance;
}
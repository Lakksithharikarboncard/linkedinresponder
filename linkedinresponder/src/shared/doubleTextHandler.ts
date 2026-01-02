export interface DoubleTextPattern {
  firstMessage: string;
  secondMessage: string;
  delayMs: number;
  pattern: string;
}

export function shouldDoubleText(reply: string, conversationContext: any): boolean {
  if (conversationContext.messageCount < 2) return false;
  
  const randomChance = Math.random() < 0.2;
  const isComplex = reply.split(' ').length > 30;
  const theyAskedMultiple = conversationContext.lastMessageQuestions > 1;
  
  return randomChance || isComplex || theyAskedMultiple;
}

export function generateDoubleText(originalReply: string, conversationContext: any): DoubleTextPattern | null {
  const patterns = [
    tryPriceBreakdown,
    tryAfterThought,
    tryQuestionRefinement,
    tryEmojiFollowup
  ];
  
  for (const pattern of patterns) {
    const result = pattern(originalReply, conversationContext);
    if (result) return result;
  }
  
  return null;
}

function tryPriceBreakdown(reply: string, context: any): DoubleTextPattern | null {
  const sentences = reply.split(/[.!?]/).filter(s => s.trim());
  if (sentences.length < 2) return null;
  
  const splitPoint = Math.floor(sentences.length / 2);
  const first = sentences.slice(0, splitPoint).join('. ').trim();
  const second = sentences.slice(splitPoint).join('. ').trim();
  
  if (first.length < 10 || second.length < 5) return null;
  
  return {
    firstMessage: first,
    secondMessage: second,
    delayMs: 3000 + Math.random() * 4000,
    pattern: 'price_breakdown'
  };
}

function tryAfterThought(reply: string, context: any): DoubleTextPattern | null {
  const words = reply.split(' ');
  if (words.length < 20) return null;
  
  const sentences = reply.split(/[.!?]/).filter(s => s.trim());
  if (sentences.length < 2) return null;
  
  const first = sentences[0].trim();
  const rest = sentences.slice(1).join('. ').trim();
  
  const afterthoughtPrefixes = ['Actually, ', 'Oh and ', 'Also - '];
  const prefix = afterthoughtPrefixes[Math.floor(Math.random() * afterthoughtPrefixes.length)];
  
  return {
    firstMessage: first,
    secondMessage: prefix + rest.charAt(0).toLowerCase() + rest.slice(1),
    delayMs: 5000 + Math.random() * 5000,
    pattern: 'afterthought'
  };
}

function tryQuestionRefinement(reply: string, context: any): DoubleTextPattern | null {
  if (!reply.includes('?')) return null;
  
  const refinements = ['Just ballpark', 'No pressure', 'Roughly'];
  
  if (Math.random() < 0.3 && reply.trim().endsWith('?')) {
    return {
      firstMessage: reply.trim(),
      secondMessage: refinements[Math.floor(Math.random() * refinements.length)],
      delayMs: 2000 + Math.random() * 2000,
      pattern: 'question_refinement'
    };
  }
  
  return null;
}

function tryEmojiFollowup(reply: string, context: any): DoubleTextPattern | null {
  if (reply.split(' ').length > 15) return null;
  
  const affirmatives = [/^(yeah|yes|yep|sure|sounds good|makes sense|got it|perfect)/i];
  const isAffirmative = affirmatives.some(pattern => pattern.test(reply));
  
  if (!isAffirmative) return null;
  
  const emojis = ['👍', '👌', '✅'];
  
  if (Math.random() < 0.4) {
    return {
      firstMessage: reply.trim(),
      secondMessage: emojis[Math.floor(Math.random() * emojis.length)],
      delayMs: 1500 + Math.random() * 2000,
      pattern: 'emoji_followup'
    };
  }
  
  return null;
}

export function calculateDoubleTextDelay(pattern: string): number {
  const baseDelays: Record<string, number> = {
    price_breakdown: 3000,
    afterthought: 6000,
    question_refinement: 1800,
    emoji_followup: 1500
  };
  
  const base = baseDelays[pattern] || 3000;
  const variance = base * 0.4;
  
  return base + (Math.random() - 0.5) * 2 * variance;
}

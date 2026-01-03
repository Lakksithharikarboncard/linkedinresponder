// linkedinresponder/src/shared/settings.ts
// Centralized schema + defaults for chrome.storage.local settings.
// Goal: one source of truth for keys/defaults, no logic change.

export type BotSettings = {
  openaiApiKey: string;
  groqApiKey: string;
  resendApiKey: string;

  replyPrompt: string;
  leadPrompt: string;
  targetEmail: string;

  chatMinDelay: number; // ms
  chatMaxDelay: number; // ms
  loopMinDelay: number; // ms
  loopMaxDelay: number; // ms

  // Working hours window (used by content script strictHours toggle)
  startHour: number; // 0-23
  endHour: number; // 0-23
};

export const SETTINGS_KEYS = {
  openaiApiKey: "openaiApiKey",
  groqApiKey: "groqApiKey",
  resendApiKey: "resendApiKey",

  replyPrompt: "replyPrompt",
  leadPrompt: "leadPrompt",
  targetEmail: "targetEmail",

  chatMinDelay: "chatMinDelay",
  chatMaxDelay: "chatMaxDelay",
  loopMinDelay: "loopMinDelay",
  loopMaxDelay: "loopMaxDelay",

  startHour: "startHour",
  endHour: "endHour",
} as const;

export const DEFAULT_SETTINGS: BotSettings = {
  openaiApiKey: "",
  groqApiKey: "",
  resendApiKey: "",

  replyPrompt:
    "You are {user_name}'s assistant. Reply to this lead based on context:\n{extracted_text}\nReply briefly and professionally.",
  leadPrompt: "Does this conversation indicate strong buying intent or interest? Reply YES or NO.",
  targetEmail: "",

  chatMinDelay: 2000,
  chatMaxDelay: 5000,
  loopMinDelay: 10000,
  loopMaxDelay: 30000,

  startHour: 9,
  endHour: 18,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.round(n);
  return Math.min(max, Math.max(min, i));
}

function clampMs(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function asString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return value;
}

function normalizeEmail(value: string): string {
  return value.trim();
}

function normalizePrompt(value: string): string {
  return value;
}

export async function getBotSettings(): Promise<BotSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(Object.values(SETTINGS_KEYS), (raw) => {
      const chatMinDelay = clampMs(raw[SETTINGS_KEYS.chatMinDelay], 250, 60_000, DEFAULT_SETTINGS.chatMinDelay);
      const chatMaxDelay = clampMs(raw[SETTINGS_KEYS.chatMaxDelay], 250, 120_000, DEFAULT_SETTINGS.chatMaxDelay);
      const loopMinDelay = clampMs(raw[SETTINGS_KEYS.loopMinDelay], 500, 600_000, DEFAULT_SETTINGS.loopMinDelay);
      const loopMaxDelay = clampMs(raw[SETTINGS_KEYS.loopMaxDelay], 500, 600_000, DEFAULT_SETTINGS.loopMaxDelay);

      // Ensure min <= max without changing intent
      const safeChatMin = Math.min(chatMinDelay, chatMaxDelay);
      const safeChatMax = Math.max(chatMinDelay, chatMaxDelay);
      const safeLoopMin = Math.min(loopMinDelay, loopMaxDelay);
      const safeLoopMax = Math.max(loopMinDelay, loopMaxDelay);

      const startHour = clampInt(raw[SETTINGS_KEYS.startHour], 0, 23, DEFAULT_SETTINGS.startHour);
      const endHour = clampInt(raw[SETTINGS_KEYS.endHour], 0, 23, DEFAULT_SETTINGS.endHour);

      const settings: BotSettings = {
        openaiApiKey: asString(raw[SETTINGS_KEYS.openaiApiKey], DEFAULT_SETTINGS.openaiApiKey).trim(),
        groqApiKey: asString(raw[SETTINGS_KEYS.groqApiKey], DEFAULT_SETTINGS.groqApiKey).trim(),
        resendApiKey: asString(raw[SETTINGS_KEYS.resendApiKey], DEFAULT_SETTINGS.resendApiKey).trim(),

        replyPrompt: normalizePrompt(asString(raw[SETTINGS_KEYS.replyPrompt], DEFAULT_SETTINGS.replyPrompt)),
        leadPrompt: normalizePrompt(asString(raw[SETTINGS_KEYS.leadPrompt], DEFAULT_SETTINGS.leadPrompt)),
        targetEmail: normalizeEmail(asString(raw[SETTINGS_KEYS.targetEmail], DEFAULT_SETTINGS.targetEmail)),

        chatMinDelay: safeChatMin,
        chatMaxDelay: safeChatMax,
        loopMinDelay: safeLoopMin,
        loopMaxDelay: safeLoopMax,

        startHour,
        endHour,
      };

      resolve(settings);
    });
  });
}

export async function setBotSettings(partial: Partial<BotSettings>): Promise<void> {
  const patch: Record<string, unknown> = {};

  if (partial.openaiApiKey !== undefined) patch[SETTINGS_KEYS.openaiApiKey] = String(partial.openaiApiKey);
  if (partial.groqApiKey !== undefined) patch[SETTINGS_KEYS.groqApiKey] = String(partial.groqApiKey);
  if (partial.resendApiKey !== undefined) patch[SETTINGS_KEYS.resendApiKey] = String(partial.resendApiKey);

  if (partial.replyPrompt !== undefined) patch[SETTINGS_KEYS.replyPrompt] = String(partial.replyPrompt);
  if (partial.leadPrompt !== undefined) patch[SETTINGS_KEYS.leadPrompt] = String(partial.leadPrompt);
  if (partial.targetEmail !== undefined) patch[SETTINGS_KEYS.targetEmail] = String(partial.targetEmail);

  if (partial.chatMinDelay !== undefined) patch[SETTINGS_KEYS.chatMinDelay] = partial.chatMinDelay;
  if (partial.chatMaxDelay !== undefined) patch[SETTINGS_KEYS.chatMaxDelay] = partial.chatMaxDelay;
  if (partial.loopMinDelay !== undefined) patch[SETTINGS_KEYS.loopMinDelay] = partial.loopMinDelay;
  if (partial.loopMaxDelay !== undefined) patch[SETTINGS_KEYS.loopMaxDelay] = partial.loopMaxDelay;

  if (partial.startHour !== undefined) patch[SETTINGS_KEYS.startHour] = partial.startHour;
  if (partial.endHour !== undefined) patch[SETTINGS_KEYS.endHour] = partial.endHour;

  return new Promise((resolve) => {
    chrome.storage.local.set(patch, () => resolve());
  });
}
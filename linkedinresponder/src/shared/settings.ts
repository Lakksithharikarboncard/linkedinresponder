// linkedinresponder/src/shared/settings.ts
// Centralized schema + defaults for chrome.storage.local settings.
// Goal: one source of truth for keys/defaults, no logic change.

export type AIProvider = "openai" | "groq" | "routeway";

export type BotSettings = {
    openaiApiKey: string;
    groqApiKey: string;
    groqApiKey2: string; // NEW: Second Groq key for rotation
    routewayApiKey: string; // NEW: Routeway API key
    webhookUrl: string; // Zapier webhook URL

    replyPrompt: string;
    leadPrompt: string;

    chatMinDelay: number; // ms
    chatMaxDelay: number; // ms
    loopMinDelay: number; // ms
    loopMaxDelay: number; // ms

    // Working hours window (used by content script strictHours toggle)
    startHour: number; // 0-23
    endHour: number; // 0-23

    // Per-function AI provider selection
    replyProvider: AIProvider; // Reply generation + decision (combined)
    leadDetectionProvider: AIProvider; // Lead qualification (separate)

    // Model selection
    groqModel: string;
    openaiModel: string;
    routewayModel: string; // NEW: Routeway model selection
};

export const SETTINGS_KEYS = {
    openaiApiKey: "openaiApiKey",
    groqApiKey: "groqApiKey",
    groqApiKey2: "groqApiKey2", // NEW
    routewayApiKey: "routewayApiKey", // NEW
    webhookUrl: "webhookUrl",

    replyPrompt: "replyPrompt",
    leadPrompt: "leadPrompt",

    chatMinDelay: "chatMinDelay",
    chatMaxDelay: "chatMaxDelay",
    loopMinDelay: "loopMinDelay",
    loopMaxDelay: "loopMaxDelay",

    startHour: "startHour",
    endHour: "endHour",

    replyProvider: "replyProvider",
    leadDetectionProvider: "leadDetectionProvider",

    groqModel: "groqModel",
    openaiModel: "openaiModel",
    routewayModel: "routewayModel", // NEW
} as const;

export const DEFAULT_SETTINGS: BotSettings = {
    openaiApiKey: "",
    groqApiKey: "",
    groqApiKey2: "", // NEW
    routewayApiKey: "", // NEW
    webhookUrl: "",

    replyPrompt:
        "You are {user_name}'s assistant. Reply to this lead based on context:\n{extracted_text}\nReply briefly and professionally.",
    leadPrompt: "Does this conversation indicate strong buying intent or interest? Reply YES or NO.",

    chatMinDelay: 2000,
    chatMaxDelay: 5000,
    loopMinDelay: 10000,
    loopMaxDelay: 30000,

    startHour: 9,
    endHour: 18,

    replyProvider: "routeway", // Default to free Routeway models
    leadDetectionProvider: "routeway",

    groqModel: "openai/gpt-oss-120b",
    openaiModel: "gpt-5.1", // NEW: Updated to GPT-5.1
    routewayModel: "devstral-2512:free", // NEW: Default free model
};

const VALID_PROVIDERS: AIProvider[] = ["openai", "groq", "routeway"]; // NEW: Added routeway

const VALID_GROQ_MODELS = [
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "moonshotai/kimi-k2-instruct-0905",
];

// UPDATED: New GPT-5.1 series models
const VALID_OPENAI_MODELS = [
    "gpt-5.1",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5.1-chat-latest",
];

// NEW: Routeway free models
const VALID_ROUTEWAY_MODELS = [
    "devstral-2512:free",
    "kimi-k2-0905:free",
    "minimax-m2:free",
    "deepseek-r1t2-chimera:free",
];

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

function asProvider(value: unknown, fallback: AIProvider): AIProvider {
    if (typeof value === "string" && VALID_PROVIDERS.includes(value as AIProvider)) {
        return value as AIProvider;
    }
    return fallback;
}

function asGroqModel(value: unknown, fallback: string): string {
    if (typeof value === "string" && VALID_GROQ_MODELS.includes(value)) {
        return value;
    }
    return fallback;
}

function asOpenaiModel(value: unknown, fallback: string): string {
    if (typeof value === "string" && VALID_OPENAI_MODELS.includes(value)) {
        return value;
    }
    return fallback;
}

// NEW: Routeway model validation
function asRoutewayModel(value: unknown, fallback: string): string {
    if (typeof value === "string" && VALID_ROUTEWAY_MODELS.includes(value)) {
        return value;
    }
    return fallback;
}

function normalizePrompt(value: string): string {
    return value;
}

function normalizeUrl(value: string): string {
    return value.trim();
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
                groqApiKey2: asString(raw[SETTINGS_KEYS.groqApiKey2], DEFAULT_SETTINGS.groqApiKey2).trim(), // NEW
                routewayApiKey: asString(raw[SETTINGS_KEYS.routewayApiKey], DEFAULT_SETTINGS.routewayApiKey).trim(), // NEW
                webhookUrl: normalizeUrl(asString(raw[SETTINGS_KEYS.webhookUrl], DEFAULT_SETTINGS.webhookUrl)),

                replyPrompt: normalizePrompt(asString(raw[SETTINGS_KEYS.replyPrompt], DEFAULT_SETTINGS.replyPrompt)),
                leadPrompt: normalizePrompt(asString(raw[SETTINGS_KEYS.leadPrompt], DEFAULT_SETTINGS.leadPrompt)),

                chatMinDelay: safeChatMin,
                chatMaxDelay: safeChatMax,
                loopMinDelay: safeLoopMin,
                loopMaxDelay: safeLoopMax,

                startHour,
                endHour,

                replyProvider: asProvider(raw[SETTINGS_KEYS.replyProvider], DEFAULT_SETTINGS.replyProvider),
                leadDetectionProvider: asProvider(raw[SETTINGS_KEYS.leadDetectionProvider], DEFAULT_SETTINGS.leadDetectionProvider),

                groqModel: asGroqModel(raw[SETTINGS_KEYS.groqModel], DEFAULT_SETTINGS.groqModel),
                openaiModel: asOpenaiModel(raw[SETTINGS_KEYS.openaiModel], DEFAULT_SETTINGS.openaiModel),
                routewayModel: asRoutewayModel(raw[SETTINGS_KEYS.routewayModel], DEFAULT_SETTINGS.routewayModel), // NEW
            };

            resolve(settings);
        });
    });
}

export async function setBotSettings(partial: Partial<BotSettings>): Promise<void> {
    const patch: Record<string, unknown> = {};

    if (partial.openaiApiKey !== undefined) patch[SETTINGS_KEYS.openaiApiKey] = String(partial.openaiApiKey);
    if (partial.groqApiKey !== undefined) patch[SETTINGS_KEYS.groqApiKey] = String(partial.groqApiKey);
    if (partial.groqApiKey2 !== undefined) patch[SETTINGS_KEYS.groqApiKey2] = String(partial.groqApiKey2); // NEW
    if (partial.routewayApiKey !== undefined) patch[SETTINGS_KEYS.routewayApiKey] = String(partial.routewayApiKey); // NEW
    if (partial.webhookUrl !== undefined) patch[SETTINGS_KEYS.webhookUrl] = String(partial.webhookUrl);

    if (partial.replyPrompt !== undefined) patch[SETTINGS_KEYS.replyPrompt] = String(partial.replyPrompt);
    if (partial.leadPrompt !== undefined) patch[SETTINGS_KEYS.leadPrompt] = String(partial.leadPrompt);

    if (partial.chatMinDelay !== undefined) patch[SETTINGS_KEYS.chatMinDelay] = partial.chatMinDelay;
    if (partial.chatMaxDelay !== undefined) patch[SETTINGS_KEYS.chatMaxDelay] = partial.chatMaxDelay;
    if (partial.loopMinDelay !== undefined) patch[SETTINGS_KEYS.loopMinDelay] = partial.loopMinDelay;
    if (partial.loopMaxDelay !== undefined) patch[SETTINGS_KEYS.loopMaxDelay] = partial.loopMaxDelay;

    if (partial.startHour !== undefined) patch[SETTINGS_KEYS.startHour] = partial.startHour;
    if (partial.endHour !== undefined) patch[SETTINGS_KEYS.endHour] = partial.endHour;

    if (partial.replyProvider !== undefined) patch[SETTINGS_KEYS.replyProvider] = partial.replyProvider;
    if (partial.leadDetectionProvider !== undefined) patch[SETTINGS_KEYS.leadDetectionProvider] = partial.leadDetectionProvider;

    if (partial.groqModel !== undefined) patch[SETTINGS_KEYS.groqModel] = partial.groqModel;
    if (partial.openaiModel !== undefined) patch[SETTINGS_KEYS.openaiModel] = partial.openaiModel;
    if (partial.routewayModel !== undefined) patch[SETTINGS_KEYS.routewayModel] = partial.routewayModel; // NEW

    return new Promise((resolve) => {
        chrome.storage.local.set(patch, () => resolve());
    });
}

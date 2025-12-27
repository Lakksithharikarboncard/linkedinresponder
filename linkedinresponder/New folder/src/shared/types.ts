// src/shared/types.ts

export type BotCommand =
  | { type: "START_BOT"; n: number }
  | { type: "STOP_BOT" }
  | { type: "PAUSE_BOT" }
  | { type: "RESUME_BOT" }
  | { type: "MANUAL_REPLY"; chatId: string; message: string };

export type BotResponse =
  | { status: "ok" }
  | { status: "error"; error: string }
  | { status: "paused" }
  | { status: "resumed" }
  | { status: "stopped" };

export type BotLogEntry = {
  time: number;
  type: string;
  detail?: any;
};

import { AI, environment } from "@raycast/api";

const CHINESE_REGEX = /\p{Script=Han}/u;

export function containsChinese(text: string): boolean {
  return CHINESE_REGEX.test(text);
}

function cleanTranslation(raw: string): string {
  const trimmed = raw.trim().replace(/\r?\n+/g, " ");
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

async function translateWithRaycastAI(text: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const prompt = [
      "Translate the following Chinese text into natural, concise English suitable as a Siri command or question.",
      "Output ONLY the English translation with no quotes, explanations, or extra text.",
      "",
      text,
    ].join("\n");

    const answer = await AI.ask(prompt, {
      creativity: "none",
      signal: controller.signal,
    });
    const cleaned = cleanTranslation(answer);
    if (!cleaned) {
      throw new Error("Empty translation from Raycast AI");
    }
    return cleaned;
  } finally {
    clearTimeout(timeout);
  }
}

async function translateWithGoogle(text: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Translation request failed with status ${response.status}`);
    }
    const data = (await response.json()) as unknown;
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error("Unexpected translation response format");
    }
    const translated = (data[0] as unknown[])
      .map((segment) => (Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : ""))
      .join("");
    const cleaned = cleanTranslation(translated);
    if (!cleaned) {
      throw new Error("Empty translation from Google Translate");
    }
    return cleaned;
  } finally {
    clearTimeout(timeout);
  }
}

export async function translateChineseToEnglish(text: string): Promise<string> {
  const normalized = text.trim();
  if (!normalized || !containsChinese(normalized)) {
    return normalized;
  }

  if (environment.canAccess(AI)) {
    try {
      return await translateWithRaycastAI(normalized);
    } catch (error) {
      console.error("Raycast AI translation failed, falling back to Google Translate:", error);
    }
  }

  return await translateWithGoogle(normalized);
}

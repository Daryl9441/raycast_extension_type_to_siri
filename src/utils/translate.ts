const CHINESE_REGEX = /\p{Script=Han}/u;

export function containsChinese(text: string): boolean {
  return CHINESE_REGEX.test(text);
}

function cleanTranslation(raw: string): string {
  return raw.trim().replace(/\r?\n+/g, " ");
}

export async function translateChineseToEnglish(text: string): Promise<string> {
  const normalized = text.trim();
  if (!normalized || !containsChinese(normalized)) {
    return normalized;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(normalized)}`;
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

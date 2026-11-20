import { environment } from "@raycast/api";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

const CHINESE_REGEX = /\p{Script=Han}/u;

const SWIFT_HELPER_NAME = "local-translate-v2";
const OLD_HELPER_NAMES = ["local-translate-v1"];

const SWIFT_SOURCE = `
import Foundation
#if canImport(Translation)
import Translation
#endif
#if canImport(FoundationModels)
import FoundationModels
#endif

@main
struct LocalTranslate {
    #if canImport(Translation)
    @available(macOS 26.0, *)
    static func tryDirectTranslate(_ text: String) async -> String? {
        let directPairs: [(String, String)] = [
            ("zh-Hans-CN", "en-US"),
            ("zh-Hans", "en-US"),
            ("zh-Hant-TW", "en-US"),
            ("zh-Hans-CN", "en-GB"),
        ]
        for (srcId, dstId) in directPairs {
            do {
                let session = TranslationSession(
                    installedSource: Locale.Language(identifier: srcId),
                    target: Locale.Language(identifier: dstId)
                )
                let response = try await session.translate(text)
                let out = response.targetText.trimmingCharacters(in: .whitespacesAndNewlines)
                if !out.isEmpty {
                    return out
                }
            } catch {
                // try next pair
            }
        }
        return nil
    }

    @available(macOS 26.0, *)
    static func findInstalledPair(retries: Int = 5) async -> (Locale.Language, Locale.Language)? {
        let availability = LanguageAvailability()
        let explicitPairs: [(String, String)] = [
            ("zh-Hans-CN", "en-US"),
            ("zh-Hans", "en-US"),
            ("zh-CN", "en-US"),
            ("zh-Hans", "en"),
        ]

        // Cold-started translationd can transiently report .supported (0.00 progress)
        // for ~0.2-1.5s while mounting MobileAsset/UAF locks. Retry briefly before giving up.
        for attempt in 0..<retries {
            for (srcId, dstId) in explicitPairs {
                let src = Locale.Language(identifier: srcId)
                let dst = Locale.Language(identifier: dstId)
                if await availability.status(from: src, to: dst) == .installed {
                    return (src, dst)
                }
            }

            let supported = await availability.supportedLanguages
            let zhLangs = supported.filter { $0.languageCode?.identifier == "zh" }
            let enLangs = supported.filter { $0.languageCode?.identifier == "en" }
            for z in zhLangs {
                for e in enLangs {
                    if await availability.status(from: z, to: e) == .installed {
                        return (z, e)
                    }
                }
            }

            if attempt + 1 < retries {
                try? await Task.sleep(nanoseconds: 350_000_000)
            }
        }
        return nil
    }
    #endif

    static func main() async {
        let isCheckOnly = CommandLine.arguments.contains("--check")

        #if canImport(Translation)
        if #available(macOS 26.0, *) {
            if isCheckOnly {
                // Fast check when translationd is already warm
                let availability = LanguageAvailability()
                if await availability.status(
                    from: Locale.Language(identifier: "zh-Hans-CN"),
                    to: Locale.Language(identifier: "en-US")
                ) == .installed {
                    FileHandle.standardOutput.write(Data("READY:translation".utf8))
                    exit(0)
                }
                // On cold start, a direct tiny translation forces translationd to mount assets immediately (~140ms)
                if await tryDirectTranslate("好") != nil {
                    FileHandle.standardOutput.write(Data("READY:translation".utf8))
                    exit(0)
                }
                // Fallback scan across all zh -> en pairs with brief retry
                if await findInstalledPair(retries: 4) != nil {
                    FileHandle.standardOutput.write(Data("READY:translation".utf8))
                    exit(0)
                }
            } else {
                let inputData = FileHandle.standardInput.readDataToEndOfFile()
                guard let text = String(data: inputData, encoding: .utf8)?
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                      !text.isEmpty else {
                    exit(0)
                }

                if let out = await tryDirectTranslate(text) {
                    FileHandle.standardOutput.write(Data(out.utf8))
                    exit(0)
                }

                if let (src, dst) = await findInstalledPair(retries: 3) {
                    do {
                        let session = TranslationSession(installedSource: src, target: dst)
                        let response = try await session.translate(text)
                        let out = response.targetText.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !out.isEmpty {
                            FileHandle.standardOutput.write(Data(out.utf8))
                            exit(0)
                        }
                    } catch {
                        // fall through
                    }
                }
            }
        }
        #endif

        #if canImport(FoundationModels)
        if #available(macOS 26.0, *) {
            if case .available = SystemLanguageModel.default.availability {
                if isCheckOnly {
                    FileHandle.standardOutput.write(Data("READY:foundation-models".utf8))
                    exit(0)
                }
                let inputData = FileHandle.standardInput.readDataToEndOfFile()
                guard let text = String(data: inputData, encoding: .utf8)?
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                      !text.isEmpty else {
                    exit(0)
                }
                do {
                    let session = LanguageModelSession()
                    let prompt = "Translate the following Chinese text into concise, natural English suitable for Siri. Output ONLY the English translation with no quotes or explanation:\\n\\(text)"
                    let response = try await session.respond(to: prompt)
                    let out = response.content.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !out.isEmpty {
                        FileHandle.standardOutput.write(Data(out.utf8))
                        exit(0)
                    }
                } catch {
                    // fall through
                }
            }
        }
        #endif

        FileHandle.standardError.write(Data("LOCAL_NOT_INSTALLED\\n".utf8))
        exit(42)
    }
}
`;

export interface TranslationResult {
  text: string;
  engine: "macos-local" | "google-translate" | "none";
}

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

function runExecFile(
  file: string,
  args: string[],
  options: { input?: string; timeout?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      {
        encoding: "utf8",
        timeout: options.timeout ?? 15000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const enriched = Object.assign(error, { stdout, stderr });
          reject(enriched);
          return;
        }
        resolve({ stdout, stderr });
      },
    );

    if (options.input !== undefined && child.stdin) {
      child.stdin.write(options.input);
      child.stdin.end();
    }
  });
}

let compilePromise: Promise<string | null> | null = null;
let checkPromise: Promise<boolean> | null = null;

async function ensureLocalTranslateHelper(): Promise<string | null> {
  const helperPath = path.join(environment.supportPath, SWIFT_HELPER_NAME);
  if (fs.existsSync(helperPath)) {
    return helperPath;
  }

  if (!fs.existsSync("/usr/bin/swiftc")) {
    return null;
  }

  if (!compilePromise) {
    compilePromise = (async () => {
      try {
        fs.mkdirSync(environment.supportPath, { recursive: true });
        for (const oldName of OLD_HELPER_NAMES) {
          const oldPath = path.join(environment.supportPath, oldName);
          if (fs.existsSync(oldPath)) {
            try {
              fs.unlinkSync(oldPath);
            } catch {
              // ignore cleanup error
            }
          }
        }
        const srcPath = path.join(environment.supportPath, `${SWIFT_HELPER_NAME}.swift`);
        const tmpBinPath = path.join(environment.supportPath, `${SWIFT_HELPER_NAME}.tmp`);
        fs.writeFileSync(srcPath, SWIFT_SOURCE, "utf8");
        await runExecFile("/usr/bin/swiftc", ["-O", "-parse-as-library", srcPath, "-o", tmpBinPath], {
          timeout: 30000,
        });
        fs.renameSync(tmpBinPath, helperPath);
        try {
          fs.unlinkSync(srcPath);
        } catch {
          // ignore cleanup failure
        }
        return helperPath;
      } catch (error) {
        console.error("Failed to compile macOS local translation helper:", error);
        return null;
      } finally {
        compilePromise = null;
      }
    })();
  }

  return compilePromise;
}

export async function checkLocalTranslationReady(): Promise<boolean> {
  if (!checkPromise) {
    checkPromise = (async () => {
      try {
        const helperPath = await ensureLocalTranslateHelper();
        if (!helperPath) return false;
        const { stdout } = await runExecFile(helperPath, ["--check"], { timeout: 10000 });
        return stdout.trim().startsWith("READY:");
      } catch {
        return false;
      } finally {
        checkPromise = null;
      }
    })();
  }
  return checkPromise;
}

async function translateWithMacOSLocal(text: string): Promise<string | null> {
  const helperPath = await ensureLocalTranslateHelper();
  if (!helperPath) return null;

  try {
    const { stdout } = await runExecFile(helperPath, [], { input: text, timeout: 12000 });
    const cleaned = cleanTranslation(stdout);
    return cleaned || null;
  } catch (error) {
    const err = error as { code?: number; stderr?: string };
    if (err.code === 42 || (typeof err.stderr === "string" && err.stderr.includes("LOCAL_NOT_INSTALLED"))) {
      return null;
    }
    console.error("macOS local translation error:", error);
    return null;
  }
}

async function curlGoogleTranslate(text: string, extraArgs: string[]): Promise<string> {
  const args = [
    "-fsSL",
    "--max-time",
    "8",
    ...extraArgs,
    "--get",
    "--data-urlencode",
    `q=${text}`,
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t",
  ];
  const { stdout } = await runExecFile("/usr/bin/curl", args, { timeout: 10000 });
  const data = JSON.parse(stdout) as unknown;
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("Unexpected Google Translate response format");
  }
  const translated = (data[0] as unknown[])
    .map((segment) => (Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : ""))
    .join("");
  const cleaned = cleanTranslation(translated);
  if (!cleaned) {
    throw new Error("Empty translation from Google Translate");
  }
  return cleaned;
}

async function translateWithGoogle(text: string): Promise<string> {
  try {
    return await curlGoogleTranslate(text, []);
  } catch {
    return await curlGoogleTranslate(text, ["--noproxy", "*"]);
  }
}

export async function translateChineseToEnglish(text: string): Promise<TranslationResult> {
  const normalized = text.trim();
  if (!normalized || !containsChinese(normalized)) {
    return { text: normalized, engine: "none" };
  }

  // Priority 1: macOS native on-device Translation / FoundationModels (100% local & offline)
  const localTranslated = await translateWithMacOSLocal(normalized);
  if (localTranslated) {
    return { text: localTranslated, engine: "macos-local" };
  }

  // Priority 2: Keyless Google Translate via macOS native curl (respects TUN / system network)
  const googleTranslated = await translateWithGoogle(normalized);
  return { text: googleTranslated, engine: "google-translate" };
}

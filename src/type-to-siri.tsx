import {
  Action,
  ActionPanel,
  closeMainWindow,
  Form,
  Icon,
  LocalStorage,
  open,
  popToRoot,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { summonAndSendToSiri } from "./utils/siri";
import { checkLocalTranslationReady, containsChinese, translateChineseToEnglish } from "./utils/translate";

const TRANSLATE_STORAGE_KEY = "translateChineseToEnglish";

interface FormValues {
  prompt: string;
  translateToEnglish: boolean;
}

export default function TypeToSiriCommand() {
  const [prompt, setPrompt] = useState("");
  const [translateToEnglish, setTranslateToEnglish] = useState(true);
  const [localReady, setLocalReady] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    LocalStorage.getItem<boolean>(TRANSLATE_STORAGE_KEY).then((stored) => {
      if (mounted && typeof stored === "boolean") {
        setTranslateToEnglish(stored);
      }
    });
    checkLocalTranslationReady().then((ready) => {
      if (mounted) {
        setLocalReady(ready);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function updateTranslateToggle(nextValue: boolean) {
    setTranslateToEnglish(nextValue);
    await LocalStorage.setItem(TRANSLATE_STORAGE_KEY, nextValue);
  }

  async function openTranslationSettings() {
    await open("x-apple.systempreferences:com.apple.Localization-Settings.extension");
  }

  async function refreshEngineStatus() {
    setLocalReady(null);
    const ready = await checkLocalTranslationReady();
    setLocalReady(ready);
    await showToast({
      style: ready ? Toast.Style.Success : Toast.Style.Failure,
      title: ready ? "macOS 本地离线翻译已就绪" : "未检测到 macOS 离线翻译包",
    });
  }

  async function sendToSiri(rawText?: string, shouldTranslate = translateToEnglish) {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      let textToSend = typeof rawText === "string" ? rawText.trim() : "";

      if (textToSend && shouldTranslate && containsChinese(textToSend)) {
        const toast = await showToast({
          style: Toast.Style.Animated,
          title: localReady ? "Translating locally on Mac..." : "Translating to English...",
        });
        try {
          const translated = await translateChineseToEnglish(textToSend);
          textToSend = translated.text;
          toast.style = Toast.Style.Success;
          toast.title = translated.engine === "macos-local" ? "Translated (macOS Local)" : "Translated (Google)";
          toast.message = textToSend;
        } catch (translateError) {
          console.error(translateError);
          toast.style = Toast.Style.Failure;
          toast.title = "Translation failed";
          toast.message = "请检查网络，或按 ⌘L 下载 macOS 本地离线翻译包";
          return;
        }
      }

      await closeMainWindow();
      const result = await summonAndSendToSiri(textToSend);
      if (result === "not-found") {
        await showHUD("Failed to summon Siri. Ensure Siri is enabled in the Menu Bar.");
      }
      await popToRoot({ clearSearchBar: true });
    } catch (error) {
      console.error(error);
      await showHUD("Failed to summon Siri. Check Accessibility & Automation permissions for Raycast.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(values: FormValues) {
    await sendToSiri(values.prompt, values.translateToEnglish);
  }

  const engineStatusText =
    localReady === true
      ? "macOS 本地离线翻译已就绪（零网络延迟、不消耗任何额度）"
      : localReady === false
        ? "未检测到 macOS 离线翻译包，当前自动回退 Google Translate（按 ⌘L 打开「语言与地区 → 翻译语言」下载中文/英文后即可纯本地离线翻译）"
        : "正在检测 macOS 本地翻译引擎…";

  return (
    <Form
      navigationTitle="Type to Siri"
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Send to Siri" icon={Icon.Message} onSubmit={handleSubmit} />
          <Action
            title={translateToEnglish ? "Disable Chinese → English Translation" : "Enable Chinese → English Translation"}
            icon={Icon.Globe}
            shortcut={{ modifiers: ["cmd"], key: "t" }}
            onAction={() => updateTranslateToggle(!translateToEnglish)}
          />
          <Action
            title="Refresh Local Translation Status"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={refreshEngineStatus}
          />
          <Action
            title="Download macOS Offline Translation Pack"
            icon={Icon.Download}
            shortcut={{ modifiers: ["cmd"], key: "l" }}
            onAction={openTranslationSettings}
          />
          <Action
            title="Open Siri Only"
            icon={Icon.AppWindow}
            shortcut={{ modifiers: ["cmd"], key: "o" }}
            onAction={() => sendToSiri("", false)}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="prompt"
        title="Ask Siri"
        placeholder="输入想对 Siri 说的话…（按 ⌘↩ 发送，留空直接唤起 Siri）"
        value={prompt}
        onChange={setPrompt}
        autoFocus
      />
      <Form.Checkbox
        id="translateToEnglish"
        title="Translation"
        label="将中文自动翻译为英文后发送给 Siri"
        info="开启后，若输入包含中文会自动翻译为英文再发送（优先使用 macOS 本地离线翻译，未下载离线包时回退 curl Google Translate）；纯英文不触发翻译。按 ⌘T 可快速切换。"
        value={translateToEnglish}
        onChange={updateTranslateToggle}
      />
      {translateToEnglish && <Form.Description title="Engine" text={engineStatusText} />}
    </Form>
  );
}

import {
  Action,
  ActionPanel,
  closeMainWindow,
  Form,
  Icon,
  LocalStorage,
  popToRoot,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { summonAndSendToSiri } from "./utils/siri";
import { containsChinese, translateChineseToEnglish } from "./utils/translate";

const TRANSLATE_STORAGE_KEY = "translateChineseToEnglish";

interface FormValues {
  prompt: string;
  translateToEnglish: boolean;
}

export default function TypeToSiriCommand() {
  const [prompt, setPrompt] = useState("");
  const [translateToEnglish, setTranslateToEnglish] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    LocalStorage.getItem<boolean>(TRANSLATE_STORAGE_KEY).then((stored) => {
      if (mounted && typeof stored === "boolean") {
        setTranslateToEnglish(stored);
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

  async function sendToSiri(rawText?: string, shouldTranslate = translateToEnglish) {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      let textToSend = typeof rawText === "string" ? rawText.trim() : "";

      if (textToSend && shouldTranslate && containsChinese(textToSend)) {
        const toast = await showToast({
          style: Toast.Style.Animated,
          title: "Translating to English...",
        });
        try {
          textToSend = await translateChineseToEnglish(textToSend);
          toast.style = Toast.Style.Success;
          toast.title = "Translated";
          toast.message = textToSend;
        } catch (translateError) {
          console.error(translateError);
          toast.style = Toast.Style.Failure;
          toast.title = "Translation failed";
          toast.message = "Please check network or turn off translation.";
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
        info="开启后，若输入包含中文会自动翻译为英文再发送（优先使用 Raycast AI，不可用时回退 Google Translate）；纯英文不触发翻译。按 ⌘T 可快速切换，状态会自动记住。"
        value={translateToEnglish}
        onChange={updateTranslateToggle}
      />
    </Form>
  );
}

import { Action, ActionPanel, closeMainWindow, Form, Icon, popToRoot, showHUD } from "@raycast/api";
import { useState } from "react";
import { summonAndSendToSiri } from "./utils/siri";

interface FormValues {
  prompt: string;
}

export default function TypeToSiriCommand() {
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function sendToSiri(text?: string) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await closeMainWindow();
      const result = await summonAndSendToSiri(text);
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
    await sendToSiri(values.prompt);
  }

  return (
    <Form
      navigationTitle="Type to Siri"
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Send to Siri" icon={Icon.Message} onSubmit={handleSubmit} />
          <Action
            title="Open Siri Only"
            icon={Icon.AppWindow}
            shortcut={{ modifiers: ["cmd"], key: "o" }}
            onAction={() => sendToSiri("")}
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
    </Form>
  );
}

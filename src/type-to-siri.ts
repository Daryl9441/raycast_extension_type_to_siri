import { closeMainWindow, LaunchProps, showHUD } from "@raycast/api";
import { summonAndSendToSiri } from "./utils/siri";

interface TypeToSiriArguments {
  prompt?: string;
}

export default async function main(props: LaunchProps<{ arguments: TypeToSiriArguments }>) {
  await closeMainWindow();
  try {
    const result = await summonAndSendToSiri(props.arguments?.prompt);
    if (result === "not-found") {
      await showHUD("Failed to summon Siri. Ensure Siri is enabled in the Menu Bar.");
    }
  } catch (error) {
    console.error(error);
    await showHUD("Failed to summon Siri. Check Accessibility & Automation permissions for Raycast.");
  }
}

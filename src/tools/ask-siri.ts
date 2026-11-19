import { showHUD, Tool } from "@raycast/api";
import { summonAndSendToSiri } from "../utils/siri";

type Input = {
  /**
   * The command to give to Siri
   */
  command: string;
};

/**
 * Read the user input and reformat it as a request to Siri. Fix any grammatical or logical errors present in the request. Note that you are responsible for doing any writing tasks the user requests, such as writing a poem, greeting, or summarizing today's news. When sending a message, do not include a colon between the send a message clause and the actual message.
 * Q: Send Bob information about the average life span of dogs
 * A: Send Bob The average lifespan of dogs is 11 years
 * Q: Send Joe a quick greeting
 * A: Send Joe Hey, what's up?
 */
export default async function (input: Input) {
  try {
    const result = await summonAndSendToSiri(input.command);
    if (result === "not-found") {
      await showHUD("Failed to summon Siri. Ensure Siri is enabled in the Menu Bar.");
      return "Failed to summon Siri. Ensure Siri is enabled in the Menu Bar.";
    }
    return "Sent request to Siri.";
  } catch (error) {
    console.error(error);
    await showHUD("Failed to summon Siri. Check Accessibility & Automation permissions for Raycast.");
    return "Failed to summon Siri.";
  }
}

export const confirmation: Tool.Confirmation<Input> = async (input: Input) => {
  return {
    message: `Send this request to Siri?\n > ${input.command}`,
  };
};

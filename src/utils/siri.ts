import { Clipboard } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";

const SUMMON_SIRI_SCRIPT = `
on pressMenuBarItem(mbItem)
    tell application "System Events"
        try
            perform action "AXPress" of mbItem
            return true
        on error
            try
                click mbItem
                return true
            end try
        end try
    end tell
    return false
end pressMenuBarItem

on summonSiri()
    tell application "System Events"
        -- Priority 1: SystemUIServer (standard Siri menu bar extra)
        if exists process "SystemUIServer" then
            tell process "SystemUIServer"
                try
                    set siriItem to (first menu bar item of menu bar 1 whose description is "Siri")
                    if my pressMenuBarItem(siriItem) then return "ok:SystemUIServer"
                end try
            end tell
        end if

        -- Priority 2: Fallback across ControlCenter / Siri / Siri AI non-Apple menu bars
        set fallbackProcs to {"ControlCenter", "Siri", "Siri AI"}
        repeat with procName in fallbackProcs
            set pName to procName as text
            if exists process pName then
                tell process pName
                    set mbList to menu bars
                    repeat with i from (count of mbList) to 1 by -1
                        set mb to item i of mbList
                        set isAppBar to false
                        try
                            if (title of menu bar item 1 of mb as text) is "Apple" then set isAppBar to true
                        end try
                        if not isAppBar then
                            try
                                set siriItems to (every menu bar item of mb whose description contains "Siri")
                                if (count of siriItems) > 0 then
                                    if my pressMenuBarItem(item 1 of siriItems) then return "ok:" & pName
                                end if
                            end try
                        end if
                    end repeat
                end tell
            end if
        end repeat
    end tell
    return "not-found"
end summonSiri

delay 0.15
return my summonSiri()
`;

const SUBMIT_PROMPT_SCRIPT = `
delay 0.45
tell application "System Events"
    keystroke "v" using command down
    delay 0.15
    key code 36
end tell
`;

export async function summonAndSendToSiri(rawPrompt?: string): Promise<string> {
  const prompt = typeof rawPrompt === "string" ? rawPrompt.trim() : "";

  const result = await runAppleScript(SUMMON_SIRI_SCRIPT);
  if (result === "not-found") {
    return "not-found";
  }

  if (prompt) {
    let previousClipboard: string | undefined;
    try {
      previousClipboard = await Clipboard.readText();
    } catch {
      previousClipboard = undefined;
    }

    try {
      await Clipboard.copy(prompt, { concealed: true });
      await runAppleScript(SUBMIT_PROMPT_SCRIPT);
    } finally {
      if (typeof previousClipboard === "string") {
        await new Promise((resolve) => setTimeout(resolve, 250));
        try {
          await Clipboard.copy(previousClipboard, { concealed: true });
        } catch {
          // ignore clipboard restore failure
        }
      }
    }
  }

  return result;
}

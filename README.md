# Raycast Extension — Type to Siri

A fixed & enhanced Raycast extension for macOS to invoke **Type to Siri** (and send commands via Raycast AI's `Ask Siri` tool), with full Unicode/Chinese input support and improved compatibility across modern macOS versions.

## What's Fixed / Improved

- **Full-window multi-line input UI**: Uses a dedicated Raycast `Form.TextArea` view instead of a cramped inline argument field (`⌘↩` to send, or leave empty to summon Siri directly).
- **Optional Chinese → English auto-translation (macOS On-Device First)**: Includes a persistent manual toggle checkbox (`⌘T` shortcut) that detects Chinese text and translates it to English before sending to Siri:
  1. **Priority 1 — macOS Native On-Device Translation** (`Translation` / `FoundationModels` frameworks on macOS 26+): 100% local, offline, fast, zero API keys or AI credits. Download **Chinese (Simplified)** and **English** under **System Settings → General → Language & Region → Translation Languages** (press `⌘L` inside the form to jump straight there).
  2. **Priority 2 — Automatic Fallback**: Keyless Google Translate via native `/usr/bin/curl` (respects macOS TUN/proxy cleanly) if the offline language pack isn't downloaded yet.
  - Pure English input skips translation with zero delay.
- **Unicode & Chinese input support**: Uses concealed clipboard paste (`Clipboard.copy(..., { concealed: true })` + `⌘V` + automatic clipboard restoration) instead of AppleScript `keystroke`, fixing broken CJK input, multi-line text, quotes, and special characters without polluting clipboard history.
- **Broad macOS Menu Bar compatibility**: Finds and triggers the Siri menu bar item across `SystemUIServer`, `ControlCenter`, `Siri`, and `Siri AI` (skipping standard application menu bars).
- **Visible error feedback**: Replaces `showToast` (which was invisible after `closeMainWindow()`) with `showHUD`.
- **Clean invocation**: Removes the extraneous `Esc` keypress and safely handles empty/optional prompts.

## Prerequisites (macOS Settings)

1. **Show Siri in Menu Bar**: Open **System Settings → Control Center → Siri** (or **Apple Intelligence & Siri**) and set Siri to **Show in Menu Bar**.
2. **Enable Type to Siri**: Open **System Settings → Accessibility → Siri** and turn on **Enable Type to Siri** (系统设置 → 辅助功能 → Siri → 启用「键入以使用 Siri」).
3. **Permissions for Raycast**: Grant **Raycast** permissions under **System Settings → Privacy & Security**:
   - **Accessibility**
   - **Automation → System Events**

## Installation (Local Extension)

```bash
npm install
npm run dev
```

Once Raycast registers the extension, you can stop `npm run dev` — the built extension remains available in Raycast.

## Commands & Tools

- **Type to Siri**: Open Siri and optionally submit a text prompt directly from Raycast.
- **Ask Siri** (Raycast AI Tool): Allows Raycast AI to send formatted commands to Siri (with confirmation).

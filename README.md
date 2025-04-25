# Claude Form Assistant Chrome Extension

This Chrome extension helps you fill forms or text content in webpages by sending queries to Claude.ai and retrieving AI-generated responses.

## Features

- Dynamically adds a Claude button to any form field when focused
- Auto-detects form questions/prompts from labels, placeholders, or nearby elements
- Sends queries to Claude.ai and inserts responses into form fields
- Uses your existing Claude.ai account and projects
- Configurable settings for default project and auto-detection

## Installation

### Development Mode Installation

1. Clone or download this repository to your local machine
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" using the toggle in the top-right corner
4. Click "Load unpacked" and select the `claude-form-assistant` folder
5. The extension should now be installed and visible in your extensions list

### Requirements

- Google Chrome browser
- An active Claude.ai account (you must be signed in to Claude.ai in your browser)

## Usage

1. Make sure you're signed into Claude.ai in your Chrome browser
2. Click on any form field on any webpage
3. When the field is focused, a Claude button will appear next to it
4. Click the Claude button to send the detected question to Claude.ai
5. If no question is detected or auto-detection is disabled, you'll be prompted to enter a question
6. Claude's response will be inserted into the form field

## Configuration

Click the extension icon in your browser toolbar to open the settings popup:

- **Default Claude Project**: Select which Claude conversation to use for queries
- **Auto-detect form questions**: Enable/disable automatic question detection from form context
- **Save Settings**: Click to save your preferences

## Troubleshooting

- **Extension not working**: Make sure you're signed into Claude.ai in the same browser
- **No Claude button appears**: Click directly in the form field to focus it. If still not appearing:
  - Refresh the page and try again
  - For complex apps like Airtable, try clicking into a few different fields
  - Some websites with iframes may have security restrictions preventing the button from appearing
- **Button positioning issues**: If the button appears in an awkward position, click into a different field and back
- **Error getting response**: Check your connection to Claude.ai or try refreshing the page
- **Works in some websites but not others**: Complex web applications (like Airtable, Google Docs) may use custom implementations that require specific handling

### Known Limitations

- Some websites with strict Content Security Policies may block the extension
- Cross-origin iframes cannot be accessed due to browser security restrictions
- Rich text editors with complex implementations might not be fully supported

## Privacy

This extension:
- Only sends data to Claude.ai, not to any third-party servers
- Only activates on form fields you specifically interact with
- Does not collect or store your data outside of your browser
- Uses your existing Claude.ai account credentials (stored in your browser cookies)

## License

Apache 2.0

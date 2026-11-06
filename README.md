# Buddy Hunt

A local browser extension for reviewing an email list and recording LinkedIn connection progress.

## Features

- Upload CSV, text, or JSON contacts. CSV accepts `email`, optional `name`, and optional `linkedin_url` columns. Plain text accepts one email per line.
- Download the list and statuses as CSV. Load restores the list saved in this browser. Clear removes it after confirmation.
- Start opens a LinkedIn people search for the next pending email, or the supplied profile URL. After you mark that contact **Connected**, **Reviewed**, or **Not found**, the next pending contact opens. Pause and Stop halt that sequence.
- Filter the list, open a search or supplied profile on demand, and remove individual contacts.
- Data stays in browser extension local storage. No server or account is required.

**LinkedIn search by email is not guaranteed to find the right person.** Verify each result before taking action. Buddy Hunt does not click LinkedIn's Connect button or infer connection status. LinkedIn [prohibits extensions that automate activity on its site](https://www.linkedin.com/help/linkedin/answer/a1341387).

## Install

Run `npm run build` after editing `src/`.

| Browser | Install from source | Interface |
| --- | --- | --- |
| Chrome | Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, select `dist/chromium` | Toolbar icon opens side panel |
| Brave | Open `brave://extensions`, enable Developer mode, choose **Load unpacked**, select `dist/chromium` | Toolbar icon opens side panel |
| Firefox | Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, select `dist/firefox/manifest.json` | Toolbar icon opens sidebar |
| Safari on macOS | Open `safari-app/BuddyHunt/BuddyHunt.xcodeproj` in Xcode, build and run, then enable the extension in Safari Settings | Toolbar icon opens a workspace tab |

Firefox temporary installs disappear after browser restart; distribution requires signing. Safari opens a persistent tab because its web extension APIs do not provide the Chrome/Firefox extension sidebar interface. Safari requires an Xcode containing app for regular installation. See [Apple's packaging guide](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari).

## File format

```csv
email,name,linkedin_url
ada@example.com,Ada Lovelace,https://www.linkedin.com/in/example
grace@example.com,Grace Hopper,
```

You can also reupload a Buddy Hunt CSV export to restore its statuses. Duplicate emails are ignored; existing local records take precedence during upload.

## Development

```sh
npm run build
npm test
```

The three extension packages are in `dist/`. The Safari Xcode project was generated from `dist/safari` with Apple's `safari-web-extension-packager`.

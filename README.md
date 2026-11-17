# Buddy Hunt

A local browser extension for reviewing an email list and recording LinkedIn connection progress.

## Features

- Upload CSV, text, or JSON contacts. CSV accepts `email`, optional `name`, and optional `linkedin_url` columns. Plain text accepts one email per line.
- Download the list and statuses as CSV. Load restores the list saved in this browser. Clear removes it after confirmation.
- Start opens a LinkedIn people search for the next pending email, or the supplied profile URL. After you mark that contact **Connected**, **Reviewed**, or **Not found**, the next pending contact opens. Pause and Stop halt that sequence.
- Filter the list, open a search or supplied profile on demand, and remove individual contacts.
- Contacts, watchlists, profiles, and chat history stay in browser extension local storage. The chat reply feature uses the OpenAI API when you request a draft.
- The **Profiles** tab records LinkedIn member profiles visible while you browse search, timeline, connections, and profile pages. Recording starts on by default and can be turned off in the tab. Each canonical profile URL is stored once, with the pages where it was seen, timestamps, headline, company, About, Experience, Education, and visible profile text when those details appear on the page. **Add all to Watchlist** adds every recorded profile's name and handle without duplicating existing entries; each profile also has its own **Add to Watchlist** button. Download exports this data as JSON; Clear profiles removes it independently of your contact list.
- The **Watchlist** tab accepts a CSV, text, or JSON list of names, LinkedIn handles, or profile URLs. CSV can use `name`, `handle`, and `linkedin_url` columns together; text uses one entry per line (prefix a single-word name with `name:`); JSON can be an array or an object with `names` and `handles` arrays. Uploaded entries appear in the tab with a **Search** button for each one. Search opens LinkedIn people results with that name or handle as the query. Visible name mentions, `@handle` mentions, and profile links matching a saved handle receive a green box on LinkedIn pages, including content loaded while scrolling. Remove individual entries or clear the list from the tab. This works independently of profile recording.
- The **Chats** tab lets you save an OpenAI API key locally and review conversations opened in LinkedIn. Focus a LinkedIn message box to show Buddy Hunt's reply controls: **Generate** reads the visible conversation and drafts a reply in the composer; **Refresh** requests another version; **Polish edits** improves the text currently in the composer; **Send** uses LinkedIn's send button. Nothing is sent automatically when a draft is generated. The extension saves conversation snapshots and messages sent from the composer locally, then includes recent sent examples in later drafting requests so the suggestions adapt to your wording. Only the selected conversation and examples are sent to the OpenAI API when you request a draft. The key is stored in extension local storage and can be removed from the Chats tab.
- **Open ChatGPT and upload** appears below the Contacts and Profiles tabs. It refreshes the active LinkedIn page's profile capture, opens a new ChatGPT tab, attempts to attach the recorded profiles as JSON, and asks the connected Google Drive and Google Sheets tools to deduplicate and merge them into an existing Sheet when one has the same name. The Sheet name comes from the captured search parameter when there is one search, or from the source category otherwise. If ChatGPT's upload controls cannot be used automatically, the new tab offers the JSON download and a copyable request for manual attachment. Google Drive and Google Sheets must be connected in ChatGPT with permission to create or update Sheets.

Profile recording uses the information rendered in your browser. It cannot capture hidden fields, content you have not loaded or scrolled into view, or information LinkedIn does not show. The extension requests access to LinkedIn pages for this feature.

**LinkedIn search by email is not guaranteed to find the right person.** Verify each result before taking action. Buddy Hunt does not click LinkedIn's Connect button or infer connection status. LinkedIn [prohibits extensions that automate activity on its site](https://www.linkedin.com/help/linkedin/answer/a1341387).

## Install

Clone the repository, then build the browser packages (Node.js and npm are required):

```sh
git clone https://github.com/xext-fun/buddy-hunt.git
cd buddy-hunt
npm run build
```

Run `npm run build` again after editing `src/`.

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

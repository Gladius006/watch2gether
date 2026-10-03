# Watch2Gether

A Google Drive watch party app with shareable rooms, synchronized host controls, and a responsive viewing screen.

## Use it

1. Share a video in Google Drive as **Anyone with the link**, with viewer downloads permitted.
2. Paste the video sharing link, enter your name, and create a room.
3. Copy the invitation link and send it to your friends. Guests enter a name and join without an account.
4. The host controls play, pause, and seeking. Each viewer controls their own mute and fullscreen.

MP4 with H.264 video and AAC audio is recommended. Browser codec support, Google Drive download quotas, and file permissions can affect playback. Private Drive files are not supported in this version. Rooms accept up to 50 active viewers and expire after 24 hours. Host access is stored in the host tab’s session storage; reopening in a different browser does not recover host control.

## Development

Requires Node 22.13+.

```powershell
npm ci
npm run db:generate
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_empty_frightful_four.sql
npm run dev
```

Apply each local migration only once. Production publishing applies migrations through Sites. The local development preview runs at the URL printed by the server.

## Implementation

- React/Vinext with Cloudflare Workers and D1.
- Durable room state and membership; no global room directory.
- Invitations contain a random room ID. Separate hashed credentials authorize host controls and participant streams.
- Clients poll every 1.2 seconds and correct playback drift using the server timeline. Controls are synchronized with a short network delay, rather than frame-accurate broadcast.
- The Worker forwards byte-range requests to Google’s public download endpoint and streams responses without buffering whole video files.
- Drive resource keys and large-file confirmation forms are handled. Redirects are restricted to Google download hosts.
- Device storage contains only display preferences and session credentials. D1 holds authoritative room state.
- A browser WebMCP create_watch_room tool is registered only when the browser supports document.modelContext. Native WebMCP validation was unavailable in the current browser.

## Checks

```powershell
node node_modules/typescript/bin/tsc --noEmit
node scripts/test-rooms.mjs
node scripts/test-browser.mjs
```

API tests require the running local preview and migrated local D1 database. They verify guest access, host authorization, shared playback, recovery, leave, and expiration. Drive tests use mocked responses to verify ranges, confirmation forms, and restricted redirects. Browser tests use the bundled Playwright runtime and Chrome, with two real room participants and a locally generated playable video fixture. Test fixtures are removed afterward. Browser screenshots stay in ignored outputs/.

A real user Drive video has not been supplied for end-to-end Google playback verification.

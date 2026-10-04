# Watch2Gether

A Google Drive watch party app with shareable rooms, synchronized host controls, and a responsive viewing screen.

## Use it

1. Share a video in Google Drive as **Anyone with the link**, with viewer downloads permitted.
2. Paste the video sharing link, enter your name, and create a room.
3. Copy the invitation link and send it to your friends. Guests enter a name and join without an account.
4. The host controls play, pause, and seeking. Each viewer controls their own mute and fullscreen.
5. In the room, choose **Add subtitles** or the **CC** button. The host can upload or replace an SRT/WebVTT file and remove it for everyone. Every viewer, including late arrivals, receives the shared file and can toggle **Show subtitles on my screen** independently.

Subtitle files must be UTF-8, at most 1 MB, with up to 5,000 cues and 600 KB of normalized text data. File formatting and positioning are simplified to plain text. Normalized cues are stored with the room and expire with it.

MP4 with H.264 video and AAC audio is recommended. Browser codec support, Google Drive download quotas, and file permissions can affect playback. Private Drive files are not supported in this version. Rooms accept up to 50 active viewers and expire after 24 hours. Host access is stored in the host tab’s session storage; reopening in a different browser does not recover host control.

## Development

Requires Node 24. Run `npm ci` then `npm run dev`. The local preview uses an automatically initialized SQLite database in ignored `.watch2gether/rooms.sqlite` and runs at http://127.0.0.1:5173/. This local database is never used in production.

## Netlify deployment

The repository is configured for Next.js on Netlify. Rooms, membership, and normalized subtitle cues persist in Netlify Database (PostgreSQL). The `@netlify/database` dependency enables automatic database provisioning; migrations live in `netlify/database/migrations/`. Video files stay in Google Drive.

```powershell
npx netlify login
npx netlify sites:create
npx netlify deploy --prod
```

Alternatively connect this project to Netlify through its dashboard. Use `watch2gether` as the base directory if importing the parent workspace, `npm run build` as the build command, and `.next` as the publish directory. Use a Netlify plan that supports Netlify Database. Site links and account credentials are stored by the CLI, outside committed source.

The app reads Netlify's server-only `NETLIFY_DB_URL`. Another PostgreSQL provider can be configured using `DATABASE_URL`; its database must have the checked-in migration applied. Do not use a `NEXT_PUBLIC_` name for either connection string. A production instance without a connected database returns a clear service error rather than silently storing rooms in temporary files.

Video responses are limited to 2 MiB byte ranges, below Netlify's response-size limit. Browsers request subsequent ranges while playing or seeking. Google must support partial downloads for the video. Real Drive playback needs to be verified with your publicly shared video after deployment.

## Implementation

- React/Next.js with Netlify server functions and PostgreSQL.
- Durable room state and membership; no global room directory.
- Invitations contain a random room ID. Separate hashed credentials authorize host controls and participant streams.
- Clients poll every 1.2 seconds and correct playback drift using the server timeline. Controls are synchronized with a short network delay, rather than frame-accurate broadcast.
- The video endpoint forwards bounded byte-range requests to Google’s public download endpoint and streams responses without buffering whole video files.
- Drive resource keys and large-file confirmation forms are handled. Redirects are restricted to Google download hosts.
- Device storage contains only display preferences and session credentials. PostgreSQL holds authoritative room state.
- A browser WebMCP create_watch_room tool is registered only when the browser supports document.modelContext. Native WebMCP validation was unavailable in the current browser.

## Checks

```powershell
node node_modules/typescript/bin/tsc --noEmit
node scripts/test-rooms.mjs
node scripts/test-browser.mjs
node scripts/test-postgres.mjs
```

API tests require the running local preview and local SQLite database. They verify guest access, host authorization, shared playback, recovery, leave, and expiration. Drive tests use mocked responses to verify ranges, confirmation forms, and restricted redirects. Browser tests use the bundled Playwright runtime and Chrome, with two real room participants and a locally generated playable video fixture. Subtitle checks cover parsing, validation, upload authorization, late arrivals, replacements, removal, timed browser cues, and independent captions visibility. Test fixtures are removed afterward. Browser screenshots stay in ignored outputs/. PostgreSQL checks run against Netlify’s isolated local database emulator and verify migrations, bound parameters, numeric timestamps, subtitle persistence, transaction rollback, and cascading deletes.

A real user Drive video has not been supplied for end-to-end Google playback verification.

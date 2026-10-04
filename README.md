# Watch2Gether

A Google Drive watch party app with shareable rooms, synchronized host controls, shared subtitles, text chat, and optional voice chat.

## Use it

1. Share a video in Google Drive as **Anyone with the link**, with viewer downloads permitted.
2. Paste the video sharing link, enter your name, and create a room.
3. Copy the invitation link and send it to your friends. Guests enter a name and join without an account.
4. The host controls play, pause, and seeking. Each viewer controls their own mute and fullscreen.
5. In the room, choose **Add subtitles** or the **CC** button. The host can upload or replace an SRT/WebVTT file and remove it for everyone. Every viewer, including late arrivals, receives the shared file and can toggle **Show subtitles on my screen** independently.
6. Use **Room chat** to send messages to everyone. Press Enter to send, or Shift + Enter for a new line. Late arrivals receive the most recent 100 messages. Messages are plain text, limited to 1,000 characters each, with up to 5,000 messages per room and a short burst limit.
7. Choose **Join voice** and allow microphone access to talk. Up to six people can join voice at once. **Mic on / Mic off** controls your microphone independently of video volume. **Leave voice**, leaving the room, or closing the page stops microphone capture. Headphones help prevent echoes.

Subtitle files must be UTF-8, at most 1 MB, with up to 5,000 cues and 600 KB of normalized text data. File formatting and positioning are simplified to plain text. Normalized cues are stored with the room and expire with it.

MP4 with H.264 video and AAC audio is recommended. Browser codec support, Google Drive download quotas, and file permissions can affect playback. Private Drive files are not supported in this version. Rooms accept up to 50 active viewers and expire after 24 hours. Host access is stored in the host tab’s session storage; reopening in a different browser does not recover host control.

## Development

Requires Node 24. Run `npm ci` then `npm run dev`. The local preview uses an automatically initialized SQLite database in ignored `.watch2gether/rooms.sqlite` and runs at http://127.0.0.1:5173/. This local database is never used in production.

## Netlify deployment

The repository is configured for Next.js on Netlify with an explicit Next.js adapter. Rooms, membership, normalized subtitle cues, chat messages, and temporary voice signaling persist in Netlify Database (PostgreSQL). The `@netlify/database` dependency enables automatic database provisioning; migrations live in `netlify/database/migrations/`. Video files stay in Google Drive. Voice audio travels between browsers using WebRTC and is not recorded or stored by this app.

```powershell
npx netlify login
npx netlify sites:create
npx netlify deploy --prod
```

Alternatively connect this project to Netlify through its dashboard. Use `watch2gether` as the base directory if importing the parent workspace, `npm run build` as the build command, and `.next` as the publish directory. Use a Netlify plan that supports Netlify Database. Site links and account credentials are stored by the CLI, outside committed source.

The app reads Netlify's server-only `NETLIFY_DB_URL`. Another PostgreSQL provider can be configured using `DATABASE_URL`; its database must have the checked-in migration applied. Do not use a `NEXT_PUBLIC_` name for either connection string. A production instance without a connected database returns a clear service error rather than silently storing rooms in temporary files.

Video responses are limited to 2 MiB byte ranges, below Netlify's response-size limit. Browsers request subsequent ranges while playing or seeking. Google must support partial downloads for the video. Real Drive playback needs to be verified with your publicly shared video after deployment.

### Voice connectivity

Voice requires HTTPS (or localhost) and browser microphone permission. The default uses [Cloudflare's public STUN service](https://developers.cloudflare.com/realtime/sfu/get-started/connection-patterns/) to establish direct connections. Some mobile, corporate, or restrictive networks require a TURN relay; direct connections cannot be guaranteed across every network without one.

To enable a relay, add these environment variables to the Netlify project and redeploy:

- `VOICE_TURN_URLS`: comma-separated provider URLs, such as `turn:relay.example.com:3478,turns:relay.example.com:5349`.
- `VOICE_TURN_USERNAME`: the provider's TURN username.
- `VOICE_TURN_CREDENTIAL`: the provider's TURN credential.

Use your own TURN service or a provider account you authorize. Keep these values out of Git. The authenticated voice-join endpoint supplies ICE credentials only to room members. No relay provider account is provisioned by this repository. Test voice between devices on different networks before relying on it for a group call.

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
node scripts/test-conversation.mjs
node scripts/test-browser.mjs
node scripts/test-postgres.mjs
# With the local preview stopped and a production build available:
node scripts/test-production.mjs
```

API tests require the running local preview and local SQLite database. They verify guest access, host authorization, shared playback, recovery, leave, and expiration. Drive tests use mocked responses to verify ranges, confirmation forms, and restricted redirects. Browser tests use the bundled Playwright runtime and Chrome, with two real room participants and a locally generated playable video fixture. Subtitle checks cover parsing, validation, upload authorization, late arrivals, replacements, removal, timed browser cues, and independent captions visibility. Test fixtures are removed afterward. Browser screenshots stay in ignored outputs/. PostgreSQL checks run against Netlify’s isolated local database emulator and verify migrations, bound parameters, numeric timestamps, subtitle persistence, transaction rollback, and cascading deletes.

A real user Drive video has not been supplied for end-to-end Google playback verification.

Conversation API tests cover membership, message persistence and retries, validation and rate limiting, private signaling and acknowledgements, mute status, voice capacity, expiry, and leave cleanup. Browser checks use synthetic microphones in isolated Chrome contexts and verify three-person WebRTC audio packets in every direction, microphone permission denial, independent mute, text sharing, history for late arrivals, and stopping microphone tracks on exit. The production check starts a built Next.js server with a fresh PostgreSQL emulator and runs these browser checks against it; port 5173 must be free. These local direct-connection tests do not validate TURN or connectivity between separate internet networks.

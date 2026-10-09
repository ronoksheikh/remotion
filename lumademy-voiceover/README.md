# Lumademy voiceover video builder

Turns a Lumademy HTML slideshow into a narrated MP4:

- one ElevenLabs voice clip **per slide** (`eleven_v4`, your voice ID in `config.json`)
- slide animations rendered frame by frame (exact, no screen-recording lag)
- a **spotlight + animated cursor** that jumps to the exact element at the exact word you are saying it
- slide animations can be time-warped so e.g. each prompt row lights up as its name is spoken
- ffmpeg stitches everything into `output/<lesson>.mp4` (1920x1080, 30 fps, H.264 + AAC)

## One-time setup

```bash
cd lumademy-voiceover
npm install
npx playwright install chromium     # downloads the browser used to render slides
cp .env.example .env                # then put your ElevenLabs key in .env
```
Needs Node 18+ and ffmpeg/ffprobe on PATH (`ffmpeg -version`).

## Build

```bash
npm run plan      # makes the voice + prints cue timings, no video (cheap check)
npm run preview   # fast low-fps draft: output/lesson-05-preview.mp4
npm run build     # final: output/lesson-05.mp4  (~4 min for a 2.7 min lesson)
node build.mjs lessons/lesson-05 --slides 3,4   # re-render only some slides (1-based), then run again without it to join
```

Voice clips are cached in `build/` by text + voice settings, so re-rendering video never re-spends ElevenLabs credits;
only edited slide text is regenerated.

## Tuning the voice (`config.json`)

| key | meaning |
|---|---|
| `tempo` | real pace control (ffmpeg, keeps pitch). 1.0 = normal, 1.2 = fast and still clear, up to ~1.3. ElevenLabs `speed` has almost no effect, so it is not used. |
| `voiceSettings.stability` | lower = more expressive, higher = more even |
| `leadSeconds` / `tailSeconds` | pause before the voice starts / after it ends on each slide |

## Editing narration and cues (`lessons/<lesson>/narration.json`)

Slide text comes from `say` in `slides.html`. To change what is spoken for a slide, add `"text": "..."` to that slide's entry.

```json
{ "slides": [
  { "cues": [ { "at": "মাপ যোগ", "sel": "#bp1", "anchor": "br", "dur": 4 } ],
    "sync": [ { "at": "মাপ যোগ", "tl": 3.28 } ] }
]}
```
- `cues[]`: when the spoken text contains `at`, spotlight the element(s) matching CSS selector `sel`
  (inside the visible slide). `anchor` = where the cursor rests (`br`, `center`, `tl`, `tr`, `bl`, `bc`),
  `dur` = seconds the highlight stays, `pad` = ring padding, `shift` = seconds earlier/later (default -0.1).
- `sync[]` (optional): maps a spoken phrase (or absolute `t` seconds) to a moment `tl` in the slide's own
  animation timeline, so animations land on the words.

For a new lesson: copy the folder, replace `slides.html`, write its `narration.json`, run `npm run plan`
(it warns if a phrase or selector is not found), then build.

## Security

The API key lives only in `.env` (git-ignored). If you pasted it in a chat or anywhere shared, rotate it in the ElevenLabs dashboard when you are done.

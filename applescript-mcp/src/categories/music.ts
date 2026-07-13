import { ScriptCategory } from "../types/index.js";
import { asString } from "../utils/escape.js";

/**
 * Music playback control via Spotify's AppleScript dictionary.
 * (Spotify must be installed; commands launch it if needed.)
 */
export const musicCategory: ScriptCategory = {
  name: "music",
  description: "Spotify playback control",
  scripts: [
    {
      name: "playpause",
      description: "Toggle play/pause in Spotify",
      script: `tell application "Spotify" to playpause
return "Playback toggled"`,
    },
    {
      name: "play",
      description: "Resume/start Spotify playback",
      script: `tell application "Spotify" to play
return "Playing"`,
    },
    {
      name: "pause",
      description: "Pause Spotify playback",
      script: `tell application "Spotify" to pause
return "Paused"`,
    },
    {
      name: "next",
      description: "Skip to the next track",
      script: `tell application "Spotify" to next track
return "Skipped to next track"`,
    },
    {
      name: "previous",
      description: "Go to the previous track",
      script: `tell application "Spotify" to previous track
return "Went to previous track"`,
    },
    {
      name: "current",
      description: "Get the currently playing track (title, artist, album, state)",
      script: `
        tell application "Spotify"
          if it is running then
            try
              set playerState to player state as string
              set trackName to name of current track
              set trackArtist to artist of current track
              set trackAlbum to album of current track
              return playerState & ": " & trackName & " — " & trackArtist & " (" & trackAlbum & ")"
            on error
              return "Nothing is playing"
            end try
          else
            return "Spotify is not running"
          end if
        end tell
      `,
    },
    {
      name: "play_uri",
      description: "Play a Spotify URI (e.g. spotify:track:..., spotify:album:..., spotify:playlist:...)",
      schema: {
        type: "object",
        properties: {
          uri: { type: "string", description: "A spotify: URI to play" },
        },
        required: ["uri"],
      },
      script: (args) => `
        tell application "Spotify"
          play track "${asString(args.uri)}"
          return "Now playing ${asString(args.uri)}"
        end tell
      `,
    },
  ],
};

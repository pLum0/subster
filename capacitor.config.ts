import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.subster',
  appName: 'Subster',
  webDir: 'dist',
  plugins: {
    // Route fetch/XHR through the native HTTP stack so Subsonic/MusicBrainz/
    // ListenBrainz calls are not subject to the WebView's CORS enforcement.
    CapacitorHttp: {
      enabled: true,
    },
  },
  server: {
    // Serve the app shell from http://localhost (not https): a plain-http
    // Subsonic server's <audio> stream would otherwise be "mixed content",
    // which modern WebViews block for media even with allowMixedContent.
    androidScheme: 'http',
  },
  android: {
    // Belt-and-braces for http(s) mixes the scheme change doesn't cover.
    allowMixedContent: true,
  },
}

export default config

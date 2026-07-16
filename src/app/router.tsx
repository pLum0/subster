import { createHashRouter } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Home } from './screens/Home'
import { ServerSetup } from './screens/ServerSetup'
import { GameSetup } from './screens/GameSetup'
import { Game } from './screens/Game'
import { Winner } from './screens/Winner'
import { useGameStore } from '../store/gameStore'

// Hash routing keeps deep links working when Subster is hosted as static files
// under an arbitrary path (no server rewrite rules required).
export const router = createHashRouter([
  { path: '/', element: <Home /> },
  { path: '/server', element: <ServerSetup /> },
  { path: '/setup', element: <GameSetup /> },
  { path: '/game', element: <Game /> },
  { path: '/winner', element: <Winner /> },
])

// Android back gesture: without a listener Capacitor closes the activity.
// Mirror each screen's own back affordance instead — deterministic targets
// rather than history(-1), since game flows leave odd history chains.
if (Capacitor.isNativePlatform()) {
  void CapApp.addListener('backButton', () => {
    const path = router.state.location.pathname
    if (path === '/game' || path === '/winner') {
      // Same as the Quit/Home buttons: end the game and stop the audio.
      useGameStore.getState().quit()
      void router.navigate('/')
    } else if (path === '/') {
      // Home: background the app (Android default), don't kill it.
      void CapApp.minimizeApp()
    } else {
      void router.navigate('/')
    }
  })
}

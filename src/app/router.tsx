import { createHashRouter } from 'react-router-dom'
import { Home } from './screens/Home'
import { ServerSetup } from './screens/ServerSetup'
import { GameSetup } from './screens/GameSetup'
import { Game } from './screens/Game'
import { Winner } from './screens/Winner'

// Hash routing keeps deep links working when Subster is hosted as static files
// under an arbitrary path (no server rewrite rules required).
export const router = createHashRouter([
  { path: '/', element: <Home /> },
  { path: '/server', element: <ServerSetup /> },
  { path: '/setup', element: <GameSetup /> },
  { path: '/game', element: <Game /> },
  { path: '/winner', element: <Winner /> },
])

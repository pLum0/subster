import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './app/router'
import { enableFullscreen } from './platform/screen'
import './index.css'

// Launch fullscreen (Android): use the whole display for a game-like feel.
void enableFullscreen()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)

import React from 'react'
// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
import './App.css'
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router-dom'
import Home from './pages/Home'
import NotFound from './pages/NotFound'
import Game from './pages/Game'

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/" element={<Home />}/>
      <Route path='/game' element={<Game />}/>
      <Route path="/*" element={<NotFound />} />
    </>
  )
)

export const App: React.FC = () => {
  return (
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>
  )
}

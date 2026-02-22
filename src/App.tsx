import React from 'react'
import Toolbar from './components/Toolbar'
import TableGrid from './components/TableGrid'

export default function App() {
  return (
    <div className="h-full flex flex-col bg-surface-0 overflow-hidden">
      <Toolbar />
      <TableGrid />
    </div>
  )
}

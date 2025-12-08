import { useState } from 'react'
import { Button } from "@/components/ui/button"

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <div data-testid="counter-display" className="text-4xl font-bold">
        {count}
      </div>
      <Button data-testid="counter-button" onClick={() => setCount((c) => c + 1)}>
        Click me
      </Button>
    </div>
  )
}

export default App
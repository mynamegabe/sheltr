import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { Toaster } from '@/components/ui/sonner'

export const Route = createRootRoute({
  component: () => (
    <>
      <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
        <Outlet />
      </div>
      <Toaster />
      <TanStackRouterDevtools />
    </>
  ),
})

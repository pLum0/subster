import { ReactNode } from 'react'

/**
 * Mobile-first app shell: a centered, phone-width column that fills the
 * viewport. Everything in Subster renders inside this.
 */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full w-full bg-slate-900 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
        {children}
      </div>
    </div>
  )
}

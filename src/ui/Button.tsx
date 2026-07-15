import { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-600/20',
  secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-100',
  ghost: 'bg-transparent hover:bg-slate-800 text-slate-300',
  danger: 'bg-red-600 hover:bg-red-500 text-white',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

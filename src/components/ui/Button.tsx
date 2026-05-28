import type { ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

const variants = {
  primary: 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800',
  secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'text-gray-600 hover:bg-gray-100',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  loading?: boolean;
}

export function Button({ variant = 'primary', loading, className, children, ...props }: Props) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5',
        'text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        'min-h-[44px]',
        variants[variant],
        className
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  );
}

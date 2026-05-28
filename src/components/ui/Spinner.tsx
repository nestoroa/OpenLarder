export function Spinner({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <span className={`${className} border-2 border-current border-t-transparent rounded-full animate-spin inline-block`} />
  );
}

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-8 py-12">
      <div className="flex items-center gap-3 text-base text-ink-muted">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
        Loading…
      </div>
    </div>
  );
}

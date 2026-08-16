import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface px-10 py-12 shadow-lg shadow-shade/5">
        <div className="mb-8 text-center">
          <span
            aria-hidden
            className="mx-auto mb-4 block h-3.5 w-3.5 rounded-full bg-accent"
          />
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
            SE Knowledge Base
          </h1>
          <p className="mt-1.5 text-base text-ink-muted">
            Notes on Software Engineering and related topics
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}

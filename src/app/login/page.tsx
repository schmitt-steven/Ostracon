import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="glass lift-3 w-full max-w-md rounded-[var(--radius-zone)] px-10 py-12">
        <div className="mb-8 text-center">
         
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
            Ostracon
          </h1>
          <p className="mt-1.5 text-base text-ink-muted">
            Personal knowledge base
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}

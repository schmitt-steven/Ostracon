import Image from "next/image";
import { LoginForm } from "@/components/auth/LoginForm";
import icon from "@/assets/ostracon-icon.png";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="glass lift-3 w-full max-w-md rounded-[var(--radius-zone)] px-10 py-12">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2.5">
            <Image
              src={icon}
              alt=""
              aria-hidden
              className="size-9 shrink-0"
              priority
            />
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
              Ostracon
            </h1>
          </div>
          <p className="mt-1.5 text-base text-ink-muted">
            Personal knowledge base
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}

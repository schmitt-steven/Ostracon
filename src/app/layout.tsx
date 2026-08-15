import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import { isAuthenticated } from "@/lib/auth/require-auth";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

// Display face for the wordmark and note headings. `opsz` keeps the serif from
// getting spindly at the small sizes it's used at here.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  axes: ["SOFT", "WONK", "opsz"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SE Knowledge Base",
  description: "Personal software-engineering notes",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // This layout wraps /login too, so the header has to know: otherwise
  // logging out lands you on a page still offering to log you out.
  const signedIn = await isAuthenticated();

  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-line/80 bg-paper/80 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-8 py-4">
            <Link href="/" className="group flex items-center gap-3">
              <span
                aria-hidden
                className="h-3 w-3 rounded-full bg-accent transition-transform group-hover:scale-125"
              />
              <span className="font-display text-xl font-semibold tracking-tight text-ink">
                SE Knowledge Base
              </span>
            </Link>
            {signedIn && (
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="rounded-full px-4 py-2 text-base text-ink-muted transition-colors hover:bg-blue-wash hover:text-blue"
                >
                  Log out
                </button>
              </form>
            )}
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}

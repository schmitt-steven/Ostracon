import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { CornerNav } from "@/components/nav/CornerNav";
import { InlineScript } from "@/components/ui/InlineScript";
import { isAuthenticated } from "@/lib/auth/require-auth";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
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
  // This layout wraps /login too, so the corner has to know: otherwise
  // logging out lands you on a page still offering to log you out. /login
  // carries its own wordmark, so signed out there's nothing to show at all.
  const signedIn = await isAuthenticated();

  return (
    <html
      lang="en"
      // The light palette is what the server can safely assume; the script
      // below corrects it during parsing when the reader's is dark, which is a
      // DOM change React would otherwise flag as a hydration mismatch.
      data-theme="light"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body className="min-h-full flex flex-col">
        {signedIn && <CornerNav />}
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Figtree, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { parseTheme, THEME_COOKIE_NAME, type Theme } from "@/lib/theme";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AIDOS — AI Delivery Intelligence",
  description:
    "Human-governed AI delivery intelligence and orchestration platform",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialTheme: Theme =
    parseTheme(cookieStore.get(THEME_COOKIE_NAME)?.value) ?? "dark";

  return (
    <html
      lang="en"
      className={`${figtree.variable} ${jetbrainsMono.variable} h-full`}
      data-theme={initialTheme}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-base font-sans text-primary antialiased">
        <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}

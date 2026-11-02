import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { themeBootScript } from "@/components/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UI Evolution Engine",
  description: "Turn a screenshot into a compiled, native SwiftUI app with Meta Muse Spark and SAM 3.1.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme class is set before paint by themeBootScript, so it can differ from the server render.
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="h-full overflow-hidden">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      </body>
    </html>
  );
}

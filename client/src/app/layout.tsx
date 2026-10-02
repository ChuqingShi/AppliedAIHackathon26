import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CaseBoard",
  description: "A live case dashboard for the law firm and its medical providers.",
};

// The app shell lives in app/[role]/layout.tsx, next to the case data it shows.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CaseBoard",
  description: "A live case dashboard for the law firm, its medical providers and the client.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

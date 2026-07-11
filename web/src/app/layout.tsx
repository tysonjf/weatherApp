import type { Metadata } from "next";
import { TRPCProvider } from "@/lib/trpc";
import "./globals.css";

export const metadata: Metadata = {
  title: "BBQ Temps",
  description: "Inkbird INT-12-BW cook tracker",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TRPCProvider>
          <main>{children}</main>
        </TRPCProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Torre de Controle AI-First | GoGroup Operações", description: "Torre de controle executiva para operações Gocase e GoBeauté." };
export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="pt-BR" className="h-full antialiased"><body className="min-h-full flex flex-col">{children}</body></html>;
}

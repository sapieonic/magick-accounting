import type { Metadata } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Magick Accounting",
    template: "%s | Magick Accounting",
  },
  description: "Simple expense management for your organization",
  applicationName: "Magick Accounting",
  keywords: ["accounting", "expenses", "finance", "management"],
};

// Runs before hydration so the html element has the correct `dark` class on
// first paint. Avoids a white-on-dark flash when the saved theme is "dark".
// Only consults localStorage — default is light if nothing is saved.
const themeBootScript = `
(function() {
  try {
    var stored = localStorage.getItem('theme');
    var theme = stored === 'dark' ? 'dark' : 'light';
    var root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    root.style.colorScheme = theme;
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

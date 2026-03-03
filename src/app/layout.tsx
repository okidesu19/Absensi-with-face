import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

export const metadata: Metadata = {
  title: "FaceAbsen - Sistem Absensi Berbasis Pengenalan Wajah",
  description: "Aplikasi absensi modern dengan teknologi Face Recognition untuk pencatatan kehadiran otomatis menggunakan Firebase dan Face API.js",
  keywords: ["Absensi", "Face Recognition", "Firebase", "Face API", "Sekolah", "Kehadiran"],
  authors: [{ name: "FaceAbsen Team" }],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  openGraph: {
    title: "FaceAbsen - Sistem Absensi Face Recognition",
    description: "Aplikasi absensi modern dengan teknologi Face Recognition",
    type: "website",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FaceAbsen",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        {/* Prefetch face-api.js models */}
        <link rel="prefetch" href="/models/tiny_face_detector_model-weights_manifest.json" />
        <link rel="prefetch" href="/models/face_landmark_68_model-weights_manifest.json" />
        <link rel="prefetch" href="/models/face_recognition_model-weights_manifest.json" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

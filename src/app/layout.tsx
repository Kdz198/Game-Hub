import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import styles from "./layout.module.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Game Hub Premium",
  description: "A premium game hub for web games",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className={styles.appContainer}>
          <header className={`${styles.header} glass-panel`}>
            <div className={styles.logo}>
              <span className={styles.logoIcon}>🎮</span>
              <h1>Game Hub</h1>
            </div>
            <nav className={styles.nav}>
              <a href="/">Trang Chủ</a>
              <a href="/categories">Danh Mục</a>
              <a href="/multiplayer">Multiplayer</a>
            </nav>
            <div className={styles.userProfile}>
              <div className={styles.avatar}></div>
            </div>
          </header>
          <main className={styles.mainContent}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter, Orbitron, Rajdhani } from "next/font/google";
import "./globals.css";
import styles from "./layout.module.css";

const inter = Inter({ subsets: ["latin"] });
const orbitron = Orbitron({ subsets: ["latin"], weight: ["400", "700", "900"] });
const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["500", "700"] });

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
      <body className={`${inter.className} ${styles.bodyBg}`}>
        <div className={styles.appContainer}>
          <header className={`${styles.header} glass-panel`}>
            <div className={styles.logo}>
              <span className={styles.logoIcon}>🎮</span>
              <h1 className={orbitron.className}>GAME<span className={styles.neonTextPink}>HUB</span></h1>
            </div>
            <nav className={`${styles.nav} ${rajdhani.className}`}>
              <a href="/">HOME</a>
              <a href="/categories">GAMES</a>
              <a href="/multiplayer">ONLINE</a>
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

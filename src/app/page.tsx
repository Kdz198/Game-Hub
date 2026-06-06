import styles from "./page.module.css";
import Link from "next/link";
import { Orbitron, Rajdhani } from "next/font/google";

const orbitron = Orbitron({ subsets: ["latin"], weight: ["400", "700", "900"] });
const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["500", "700"] });

export default function Home() {
  const games = [
    {
      id: "flappy-bird",
      title: "NEON FLAPPER",
      category: "ARCADE / ENDLESS",
      description: "Điều khiển tàu vũ trụ vượt qua ma trận chướng ngại vật với tốc độ ánh sáng.",
      icon: "🚀",
      neonColor: "#00f0ff", // Neon Cyan
      status: "ONLINE",
      players: "1,342"
    },
    {
      id: "block-blast",
      title: "SYNTH BLOCK",
      category: "PUZZLE / STRATEGY",
      description: "Sắp xếp các khối hình học đa chiều năng lượng cao để phá vỡ cấu trúc không gian.",
      icon: "🧊",
      neonColor: "#ff007f", // Neon Pink
      status: "ONLINE",
      players: "2,514"
    },
    {
      id: "snake",
      title: "TRON SNAKE",
      category: "ARCADE / SURVIVAL",
      description: "Điều khiển Lightcycle thu thập Data Packets trên ma trận lưới không gian ảo.",
      icon: "🏍️",
      neonColor: "#39ff14", // Neon Green
      status: "ONLINE",
      players: "1,890"
    },
    {
      id: "fly-shooter",
      title: "BUG HUNTER",
      category: "ARCADE / SHOOTER",
      description: "Tiêu diệt Drone Bug xâm nhập hệ thống bằng tia laser trong 30 giây căng thẳng.",
      icon: "🪲",
      neonColor: "#ff3333", // Neon Red
      status: "ONLINE",
      players: "978"
    },
    {
      id: "grid-rider",
      title: "GRID RIDER",
      category: "OUTRUN / RACING",
      description: "Đua xe giả lập 3D trên xa lộ neon dưới hoàng hôn Synthwave tuyệt đẹp.",
      icon: "🏎️",
      neonColor: "#ff00f0", // Neon Magenta/Purple
      status: "ONLINE",
      players: "2,045"
    }
  ];

  return (
    <div className={`${styles.container} ${rajdhani.className} animate-fade-in`}>
      <section className={styles.heroSplit}>
        <div className={styles.heroLeft}>
          <h1 className={`${styles.title} ${orbitron.className}`}>
            ARCADE<br/>NEXUS
          </h1>
          <p className={styles.subtitle}>GIAO THỨC GIẢI TRÍ ĐA CHIỀU • V3.0</p>
          <div className={styles.marqueeContainer}>
            <div className={`${styles.marquee} ${orbitron.className}`}>
              <span>[ STATUS: ONLINE ]</span>
              <span>[ 99.9% UPTIME ]</span>
              <span>[ 1.3K ACTIVE USERS ]</span>
              <span>[ 4 PROTOCOLS ]</span>
              <span>[ STATUS: ONLINE ]</span>
            </div>
          </div>
          <button className={`${styles.cyberButton} ${orbitron.className}`}>INITIALIZE</button>
        </div>
        
        <div className={styles.heroRight}>
          <div className={styles.outrunSun}>
            <div className={styles.sunLines}></div>
          </div>
        </div>
      </section>

      <section className={styles.gameSection}>
        <div className={styles.sectionHeader}>
          <h2 className={`${orbitron.className} ${styles.sectionTitle}`}>AVAILABLE_GAMES</h2>
          <Link href="/categories" className={`${styles.viewAll} ${orbitron.className}`}>[ VIEW_ALL ]</Link>
        </div>
        
        <div className={styles.gameGrid}>
          {games.map(game => (
            <Link 
              href={game.status === 'ONLINE' ? `/games/${game.id}` : '#'} 
              key={game.id} 
              className={`${styles.gameCard} ${game.status !== 'ONLINE' ? styles.cardDisabled : ''}`}
              style={{ '--theme-color': game.neonColor } as React.CSSProperties}
            >
              <div className={styles.cardGlow}></div>
              
              <div className={styles.gameHeader}>
                <span className={`${styles.gameCategory} ${orbitron.className}`}>{game.category}</span>
                <span className={`${styles.gameStatus} ${orbitron.className}`} 
                      style={{ color: game.status === 'ONLINE' ? '#39ff14' : (game.status === 'MAINTENANCE' ? '#ff3333' : '#fff01f') }}>
                  {game.status}
                </span>
              </div>
              
              <div className={styles.gameIconWrapper}>
                <span className={styles.gameIcon}>{game.icon}</span>
              </div>
              
              <div className={styles.gameInfo}>
                <h3 className={`${orbitron.className} ${styles.gameTitle}`}>{game.title}</h3>
                <p className={styles.gameDesc}>{game.description}</p>
              </div>
              
              <div className={styles.cardFooter}>
                <div className={styles.playerCount}>
                  <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                  <span className={orbitron.className}>{game.players}</span>
                </div>
                {game.status === 'ONLINE' && (
                  <div className={`${styles.playBtn} ${orbitron.className}`}>PLAY_NOW</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

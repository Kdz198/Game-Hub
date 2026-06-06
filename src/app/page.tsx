import styles from "./page.module.css";
import Link from "next/link";

export default function Home() {
  const games = [
    {
      id: "flappy-bird",
      title: "Flappy Bird",
      category: "Arcade",
      description: "Chạm để bay qua các ống nước!",
      icon: "🐦",
      color: "#ffeb3b"
    },
    {
      id: "block-blast",
      title: "Block Blast",
      category: "Puzzle",
      description: "Xếp hình khối đầy thử thách",
      icon: "🧩",
      color: "#f44336"
    },
    {
      id: "co-tuong",
      title: "Cờ Tướng",
      category: "Multiplayer",
      description: "Đấu trí chiến thuật (Sắp ra mắt)",
      icon: "♟️",
      color: "#4caf50"
    }
  ];

  return (
    <div className={`${styles.container} animate-fade-in`}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.title}>Khám Phá Vũ Trụ Game Của Bạn</h1>
          <p className={styles.subtitle}>Trải nghiệm những trò chơi giải trí tuyệt vời nhất với giao diện tối ưu và mượt mà.</p>
          <button className={styles.primaryButton}>Chơi Ngay</button>
        </div>
      </section>

      <section className={styles.gameSection}>
        <div className={styles.sectionHeader}>
          <h2>Game Nổi Bật</h2>
          <Link href="/categories" className={styles.viewAll}>Xem tất cả</Link>
        </div>
        
        <div className={styles.gameGrid}>
          {games.map(game => (
            <Link href={`/games/${game.id}`} key={game.id} className={`${styles.gameCard} glass-panel`}>
              <div className={styles.gameIcon} style={{ background: `linear-gradient(135deg, ${game.color}22, ${game.color}55)` }}>
                <span style={{ fontSize: "3rem" }}>{game.icon}</span>
              </div>
              <div className={styles.gameInfo}>
                <span className={styles.gameCategory}>{game.category}</span>
                <h3>{game.title}</h3>
                <p>{game.description}</p>
              </div>
              <div className={styles.playOverlay}>
                <span className={styles.playButton}>▶</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

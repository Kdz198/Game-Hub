import SnakeCanvas from "@/components/game-wrapper/SnakeCanvas";

export default function SnakePage() {
  return (
    <main style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
      <SnakeCanvas />
    </main>
  );
}

'use client';

import React, { useEffect, useRef } from 'react';

interface RLBrainVisualizerProps {
  game: any;
}

const INPUT_LABELS = [
  'DANGER AHEAD',
  'DANGER LEFT',
  'DANGER RIGHT',
  'DIR: UP',
  'DIR: DOWN',
  'DIR: LEFT',
  'DIR: RIGHT',
  'FOOD: UP',
  'FOOD: DOWN',
  'FOOD: LEFT',
  'FOOD: RIGHT'
];

const OUTPUT_LABELS = [
  'STRAIGHT',
  'TURN LEFT',
  'TURN RIGHT'
];

export default function RLBrainVisualizer({ game }: RLBrainVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const pulseOffsetRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw the neural network
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const width = canvas.width;
      const height = canvas.height;
      
      // Pull real-time data from game object
      const state = (game && game.rlLastState) || Array(11).fill(0);
      const qValues = (game && game.rlLastQValues) || [0, 0, 0];
      const selectedAction = (game && game.rlLastAction !== undefined) ? game.rlLastAction : -1;

      // Node positions
      const inputX = 100;
      const hiddenX = width / 2 + 20;
      const outputX = width - 100;
      
      const inputCount = 11;
      const hiddenCount = 6;
      const outputCount = 3;
      
      const inputNodes: { x: number; y: number; active: boolean; label: string }[] = [];
      const hiddenNodes: { x: number; y: number }[] = [];
      const outputNodes: { x: number; y: number; q: number; active: boolean; label: string }[] = [];

      // Calculate node positions
      const paddingY = 25;
      const inputSpacing = (height - 2 * paddingY) / (inputCount - 1);
      for (let i = 0; i < inputCount; i++) {
        inputNodes.push({
          x: inputX,
          y: paddingY + i * inputSpacing,
          active: state[i] === 1,
          label: INPUT_LABELS[i]
        });
      }

      const hiddenSpacing = (height - 2 * paddingY) / (hiddenCount - 1);
      for (let i = 0; i < hiddenCount; i++) {
        hiddenNodes.push({
          x: hiddenX,
          y: paddingY + i * hiddenSpacing
        });
      }

      const outputSpacing = 100;
      const outputOffset = (height - (outputCount - 1) * outputSpacing) / 2;
      for (let i = 0; i < outputCount; i++) {
        outputNodes.push({
          x: outputX,
          y: outputOffset + i * outputSpacing,
          q: qValues[i] || 0,
          active: selectedAction === i,
          label: OUTPUT_LABELS[i]
        });
      }

      // 1. Draw connections/synapses
      ctx.lineWidth = 1;
      pulseOffsetRef.current = (pulseOffsetRef.current + 0.05) % 1; // animate pulse flow
      
      // Input to Hidden
      inputNodes.forEach((input) => {
        hiddenNodes.forEach((hidden) => {
          ctx.beginPath();
          ctx.moveTo(input.x, input.y);
          ctx.lineTo(hidden.x, hidden.y);
          if (input.active) {
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
            ctx.lineWidth = 1.5;
          } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.lineWidth = 0.5;
          }
          ctx.stroke();

          // Animated pulses flowing along active connections
          if (input.active) {
            const px = input.x + (hidden.x - input.x) * pulseOffsetRef.current;
            const py = input.y + (hidden.y - input.y) * pulseOffsetRef.current;
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#00f0ff';
            ctx.fill();
          }
        });
      });

      // Hidden to Output
      hiddenNodes.forEach((hidden) => {
        outputNodes.forEach((output) => {
          ctx.beginPath();
          ctx.moveTo(hidden.x, hidden.y);
          ctx.lineTo(output.x, output.y);
          if (output.active) {
            ctx.strokeStyle = 'rgba(57, 255, 20, 0.3)';
            ctx.lineWidth = 1.5;
          } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.lineWidth = 0.5;
          }
          ctx.stroke();

          if (output.active) {
            const px = hidden.x + (output.x - hidden.x) * pulseOffsetRef.current;
            const py = hidden.y + (output.y - hidden.y) * pulseOffsetRef.current;
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#39ff14';
            ctx.fill();
          }
        });
      });

      // 2. Draw nodes
      // Input Nodes
      inputNodes.forEach((node) => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 6, 0, Math.PI * 2);
        if (node.active) {
          ctx.fillStyle = node.label.startsWith('DANGER') ? '#ff007f' : '#00f0ff';
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 10;
        } else {
          ctx.fillStyle = '#1c1c3a';
          ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.stroke();

        // Label text
        ctx.font = 'bold 8px "Orbitron", sans-serif';
        ctx.fillStyle = node.active ? '#fff' : '#666';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.label, node.x - 12, node.y);
      });

      // Hidden Nodes
      hiddenNodes.forEach((node) => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#25254d';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.stroke();
      });

      // Output Nodes
      outputNodes.forEach((node) => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 10, 0, Math.PI * 2);
        if (node.active) {
          ctx.fillStyle = '#39ff14'; // Active action glows green
          ctx.shadowColor = '#39ff14';
          ctx.shadowBlur = 15;
        } else {
          ctx.fillStyle = '#1c1c3a';
          ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = node.active ? '#fff' : 'rgba(255,255,255,0.15)';
        ctx.stroke();

        // Label
        ctx.font = 'bold 9px "Orbitron", sans-serif';
        ctx.fillStyle = node.active ? '#39ff14' : '#888';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.label, node.x + 16, node.y - 6);

        // Q Value text
        ctx.font = '8px "Orbitron", sans-serif';
        ctx.fillStyle = node.active ? '#fff' : '#555';
        ctx.fillText(`Q: ${node.q.toFixed(2)}`, node.x + 16, node.y + 6);
      });
    };

    // Render loop
    const tick = () => {
      draw();
      animationRef.current = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [game]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      background: 'rgba(5, 5, 16, 0.85)',
      border: '1px solid rgba(0, 240, 255, 0.2)',
      borderRadius: '8px',
      padding: '1rem',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      width: '320px',
      height: '380px'
    }}>
      <h3 style={{
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '0.8rem',
        color: '#00f0ff',
        letterSpacing: '2px',
        margin: '0 0 0.5rem 0',
        textShadow: '0 0 5px rgba(0, 240, 255, 0.5)'
      }}>AI NEURAL NETWORK</h3>
      <canvas 
        ref={canvasRef} 
        width={300} 
        height={320} 
        style={{ display: 'block', width: '300px', height: '320px' }} 
      />
    </div>
  );
}

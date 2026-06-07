import * as tf from '@tensorflow/tfjs';

type Point = { x: number; y: number };

export interface Transition {
  state: number[];
  action: number;
  reward: number;
  nextState: number[];
  done: boolean;
}

export class SnakeRLAgent {
  public model: tf.Sequential;
  private targetModel: tf.Sequential;
  private memory: Transition[] = [];
  private maxMemorySize = 15000;
  
  public epsilon = 1.0;
  public minEpsilon = 0.01;
  public epsilonDecay = 0.996;
  private gamma = 0.9;
  private learningRate = 0.001;
  private batchSize = 64;
  
  public stateSize = 15;
  public actionSize = 3; // 0: Straight, 1: Turn Left, 2: Turn Right
  
  public trainCount = 0;
  private updateTargetEvery = 15; // steps
  private isTraining = false;

  constructor() {
    this.model = this.createModel();
    this.targetModel = this.createModel();
    this.updateTargetModel();
    this.warmup();
  }

  private warmup() {
    tf.tidy(() => {
      const dummyInput = tf.zeros([1, this.stateSize]);
      this.model.predict(dummyInput);
      this.targetModel.predict(dummyInput);
    });
  }

  private createModel(): tf.Sequential {
    const model = tf.sequential();
    
    // Hidden Layer 1
    model.add(tf.layers.dense({
      inputShape: [this.stateSize],
      units: 128,
      activation: 'relu',
      kernelInitializer: 'heNormal'
    }));

    // Hidden Layer 2
    model.add(tf.layers.dense({
      units: 64,
      activation: 'relu',
      kernelInitializer: 'heNormal'
    }));

    // Output Layer
    model.add(tf.layers.dense({
      units: this.actionSize,
      activation: 'linear'
    }));

    model.compile({
      optimizer: tf.train.adam(this.learningRate),
      loss: 'meanSquaredError'
    });

    return model;
  }

  private updateTargetModel() {
    this.targetModel.setWeights(this.model.getWeights());
  }

  // Get action (epsilon-greedy)
  public getAction(state: number[], explore = true): number {
    if (explore && Math.random() < this.epsilon) {
      // Explore: random relative action
      return Math.floor(Math.random() * this.actionSize);
    }
    
    // Exploit: predict Q-values
    return tf.tidy(() => {
      const stateTensor = tf.tensor2d([state]);
      const prediction = this.model.predict(stateTensor) as tf.Tensor;
      const actionTensor = prediction.argMax(1);
      const action = actionTensor.dataSync()[0];
      return action;
    });
  }

  // Get Q-values for a given state (for visualization)
  public getQValues(state: number[]): number[] {
    return tf.tidy(() => {
      const stateTensor = tf.tensor2d([state]);
      const prediction = this.model.predict(stateTensor) as tf.Tensor;
      return Array.from(prediction.dataSync());
    });
  }

  // Remember transition
  public remember(state: number[], action: number, reward: number, nextState: number[], done: boolean) {
    this.memory.push({ state, action, reward, nextState, done });
    if (this.memory.length > this.maxMemorySize) {
      this.memory.shift();
    }
  }

  // Train on a batch from replay memory
  public trainOnBatch(): number | null {
    if (this.isTraining || this.memory.length < this.batchSize) {
      return null;
    }

    // Sample a random batch
    const batch: Transition[] = [];
    for (let i = 0; i < this.batchSize; i++) {
      const randomIndex = Math.floor(Math.random() * this.memory.length);
      batch.push(this.memory[randomIndex]);
    }

    const states = batch.map(t => t.state);
    const nextStates = batch.map(t => t.nextState);

    // Perform target calculation and training inside tf.tidy to prevent memory leaks
    const loss = tf.tidy(() => {
      const statesTensor = tf.tensor2d(states);
      const nextStatesTensor = tf.tensor2d(nextStates);

      // Predict Q(s) and Q(s')
      const qValues = this.model.predict(statesTensor) as tf.Tensor;
      const nextQValues = this.targetModel.predict(nextStatesTensor) as tf.Tensor;

      const qValuesData = qValues.arraySync() as number[][];
      const nextQValuesData = nextQValues.arraySync() as number[][];

      // Update target Q values
      const updatedTargets = qValuesData.map((currentQ, idx) => {
        const transition = batch[idx];
        const newTargets = [...currentQ];
        if (transition.done) {
          newTargets[transition.action] = transition.reward;
        } else {
          const maxNextQ = Math.max(...nextQValuesData[idx]);
          newTargets[transition.action] = transition.reward + this.gamma * maxNextQ;
        }
        return newTargets;
      });

      const targetsTensor = tf.tensor2d(updatedTargets);

      // Train model
      // Use model.fitSync or wait for fit (we use async fit inside train step)
      return { statesTensor, targetsTensor };
    });

    if (!loss) return null;

    this.isTraining = true;

    // Train the model asynchronously
    this.model.fit(loss.statesTensor, loss.targetsTensor, {
      epochs: 1,
      verbose: 0
    }).then((history) => {
      // Clean up tensors
      loss.statesTensor.dispose();
      loss.targetsTensor.dispose();

      this.trainCount++;
      if (this.trainCount % this.updateTargetEvery === 0) {
        this.updateTargetModel();
      }
      this.isTraining = false;
    }).catch((err) => {
      console.error("Error during model.fit:", err);
      loss.statesTensor.dispose();
      loss.targetsTensor.dispose();
      this.isTraining = false;
    });

    // Decay epsilon
    if (this.epsilon > this.minEpsilon) {
      this.epsilon *= this.epsilonDecay;
      if (this.epsilon < this.minEpsilon) {
        this.epsilon = this.minEpsilon;
      }
    }

    return this.epsilon;
  }

  // Get current state array
  public getState(
    snake: Point[],
    dx: number,
    dy: number,
    food: Point | null,
    gridCols: number,
    gridRows: number
  ): number[] {
    if (snake.length === 0 || !food) {
      return Array(this.stateSize).fill(0);
    }

    const head = snake[0];

    // Absolute directions relative to head
    const isGoingUp = dy === -1 ? 1 : 0;
    const isGoingDown = dy === 1 ? 1 : 0;
    const isGoingLeft = dx === -1 ? 1 : 0;
    const isGoingRight = dx === 1 ? 1 : 0;

    // Relative actions mapping
    // Action 0: Straight, Action 1: Left, Action 2: Right
    const checkDanger = (adx: number, ady: number) => {
      const nx = head.x + adx;
      const ny = head.y + ady;
      if (nx < 0 || nx >= gridCols || ny < 0 || ny >= gridRows) return 1;
      
      // Check body
      for (let i = 0; i < snake.length - 1; i++) {
        if (snake[i].x === nx && snake[i].y === ny) return 1;
      }
      return 0;
    };

    // Calculate danger in straight, left, right directions relative to current headings
    let dangerStraight = 0;
    let dangerLeft = 0;
    let dangerRight = 0;

    if (isGoingRight) {
      dangerStraight = checkDanger(1, 0);
      dangerLeft = checkDanger(0, -1);
      dangerRight = checkDanger(0, 1);
    } else if (isGoingLeft) {
      dangerStraight = checkDanger(-1, 0);
      dangerLeft = checkDanger(0, 1);
      dangerRight = checkDanger(0, -1);
    } else if (isGoingUp) {
      dangerStraight = checkDanger(0, -1);
      dangerLeft = checkDanger(-1, 0);
      dangerRight = checkDanger(1, 0);
    } else if (isGoingDown) {
      dangerStraight = checkDanger(0, 1);
      dangerLeft = checkDanger(1, 0);
      dangerRight = checkDanger(-1, 0);
    }

    // Food location relative to head
    const foodUp = food.y < head.y ? 1 : 0;
    const foodDown = food.y > head.y ? 1 : 0;
    const foodLeft = food.x < head.x ? 1 : 0;
    const foodRight = food.x > head.x ? 1 : 0;

    // Calculate reachable space percentages for the 3 relative actions
    const pStraight = isGoingRight ? { x: head.x + 1, y: head.y }
                    : isGoingLeft ? { x: head.x - 1, y: head.y }
                    : isGoingUp ? { x: head.x, y: head.y - 1 }
                    : { x: head.x, y: head.y + 1 };

    const pLeft = isGoingRight ? { x: head.x, y: head.y - 1 }
                : isGoingLeft ? { x: head.x, y: head.y + 1 }
                : isGoingUp ? { x: head.x - 1, y: head.y }
                : { x: head.x + 1, y: head.y };

    const pRight = isGoingRight ? { x: head.x, y: head.y + 1 }
                 : isGoingLeft ? { x: head.x, y: head.y - 1 }
                 : isGoingUp ? { x: head.x + 1, y: head.y }
                 : { x: head.x - 1, y: head.y };

    const spaceStraight = this.getReachableSpace(pStraight, snake, gridCols, gridRows);
    const spaceLeft = this.getReachableSpace(pLeft, snake, gridCols, gridRows);
    const spaceRight = this.getReachableSpace(pRight, snake, gridCols, gridRows);

    const fillRatio = snake.length / (gridCols * gridRows);

    return [
      dangerStraight,
      dangerLeft,
      dangerRight,
      isGoingUp,
      isGoingDown,
      isGoingLeft,
      isGoingRight,
      foodUp,
      foodDown,
      foodLeft,
      foodRight,
      spaceStraight,
      spaceLeft,
      spaceRight,
      fillRatio
    ];
  }

  // Calculate reachable space ratio (0.0 to 1.0) using static BFS/FloodFill
  private getReachableSpace(
    start: Point,
    snake: Point[],
    gridCols: number,
    gridRows: number
  ): number {
    if (start.x < 0 || start.x >= gridCols || start.y < 0 || start.y >= gridRows) return 0;

    // Check collision with snake body (excluding tail since tail moves)
    for (let i = 0; i < snake.length - 1; i++) {
      if (snake[i].x === start.x && snake[i].y === start.y) return 0;
    }

    const bodySet = new Set<string>();
    // Exclude tail from blocked set because tail moves away
    for (let i = 0; i < snake.length - 1; i++) {
      bodySet.add(`${snake[i].x},${snake[i].y}`);
    }

    const queue: Point[] = [start];
    const visited = new Set<string>();
    visited.add(`${start.x},${start.y}`);

    let count = 0;
    const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      count++;

      for (const d of dirs) {
        const nx = curr.x + d.x;
        const ny = curr.y + d.y;
        const key = `${nx},${ny}`;

        if (nx >= 0 && nx < gridCols && ny >= 0 && ny < gridRows) {
          if (!visited.has(key) && !bodySet.has(key)) {
            visited.add(key);
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }

    const totalCells = gridCols * gridRows;
    return count / totalCells;
  }

  // Save weights to local storage
  public saveModel(key = 'snake-dqn-weights'): boolean {
    try {
      this.model.save(`localstorage://${key}`);
      return true;
    } catch (e) {
      console.error('Failed to save weights to localstorage:', e);
      return false;
    }
  }

  // Load weights from local storage
  public async loadModel(key = 'snake-dqn-weights'): Promise<boolean> {
    try {
      const loadedModel = await tf.loadLayersModel(`localstorage://${key}`);
      
      // Create fresh models matching the loaded configuration
      this.model.setWeights(loadedModel.getWeights());
      this.updateTargetModel();
      
      // Stop exploring since we loaded a trained model
      this.epsilon = this.minEpsilon;
      
      console.log('Successfully loaded model weights from localstorage');
      return true;
    } catch (e) {
      console.warn('Failed to load weights from localstorage:', e);
      return false;
    }
  }
}

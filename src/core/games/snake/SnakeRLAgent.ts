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
  
  public stateSize = 11;
  public actionSize = 3; // 0: Straight, 1: Turn Left, 2: Turn Right
  
  public trainCount = 0;
  private updateTargetEvery = 15; // steps

  constructor() {
    this.model = this.createModel();
    this.targetModel = this.createModel();
    this.updateTargetModel();
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
  public getAction(state: number[]): number {
    if (Math.random() < this.epsilon) {
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

  // Remember transition
  public remember(state: number[], action: number, reward: number, nextState: number[], done: boolean) {
    this.memory.push({ state, action, reward, nextState, done });
    if (this.memory.length > this.maxMemorySize) {
      this.memory.shift();
    }
  }

  // Train on a batch from replay memory
  public trainOnBatch(): number | null {
    if (this.memory.length < this.batchSize) {
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
      foodRight
    ];
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

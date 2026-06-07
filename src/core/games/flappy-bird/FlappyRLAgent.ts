import * as tf from '@tensorflow/tfjs';

type Point = { x: number; y: number };

export interface Transition {
  state: number[];
  action: number;
  reward: number;
  nextState: number[];
  done: boolean;
}

export class FlappyRLAgent {
  public model: tf.Sequential;
  private targetModel: tf.Sequential;
  private memory: Transition[] = [];
  private maxMemorySize = 15000;
  
  public epsilon = 1.0;
  public minEpsilon = 0.01;
  public epsilonDecay = 0.9985;
  private gamma = 0.9;
  private learningRate = 0.001;
  private batchSize = 64;
  
  public stateSize = 6;
  public actionSize = 2; // 0: Glide (Do Nothing), 1: Flap (Jump)
  
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
      // Explore: random action (0 or 1)
      return Math.random() < 0.15 ? 1 : 0; // Bias exploration slightly towards glides because flaps are powerful
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
    birdY: number,
    birdVelocity: number,
    nextPipe: { x: number; topHeight: number; gapSize: number } | null,
    birdX: number,
    width: number,
    height: number,
    groundY: number
  ): number[] {
    const normBirdY = birdY / groundY;
    const normVelocity = Math.max(-1.0, Math.min(1.0, birdVelocity / 10.0));

    let normPipeDist = 1.0;
    let normTopPipeY = 0.0;
    let normBottomPipeY = 1.0;
    let normGapDiff = 0.0;

    if (nextPipe) {
      // Distance to next pipe (normalized)
      normPipeDist = Math.max(0.0, Math.min(1.0, (nextPipe.x - birdX) / width));
      
      // Top pipe boundary (normalized)
      normTopPipeY = nextPipe.topHeight / groundY;

      // Bottom pipe boundary (normalized)
      const bottomPipeY = nextPipe.topHeight + nextPipe.gapSize;
      normBottomPipeY = bottomPipeY / groundY;

      // Gap center Y (normalized)
      const gapCenterY = nextPipe.topHeight + nextPipe.gapSize / 2;
      const normGapCenter = gapCenterY / groundY;
      
      // Difference (gapCenter - birdY) normalized to [-1, 1]
      normGapDiff = normGapCenter - normBirdY;
    }

    return [
      normBirdY,
      normVelocity,
      normPipeDist,
      normTopPipeY,
      normBottomPipeY,
      normGapDiff
    ];
  }

  // Save weights to local storage
  public saveModel(key = 'flappy-dqn-weights'): boolean {
    try {
      this.model.save(`localstorage://${key}`);
      return true;
    } catch (e) {
      console.error('Failed to save weights to localstorage:', e);
      return false;
    }
  }

  // Load weights from local storage
  public async loadModel(key = 'flappy-dqn-weights'): Promise<boolean> {
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

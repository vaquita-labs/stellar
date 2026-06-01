import { VaquitaAnimationState } from '@/core-ui/types';

export class VaquitaBrain {
  private lastStateChange: number;
  public state: VaquitaAnimationState;
  private position: [number, number];

  constructor(initial: VaquitaAnimationState = 'walking', position: [number, number]) {
    this.state = initial;
    this.lastStateChange = performance.now();
    this.position = position;
  }

  shouldChangeState(): boolean {
    const now = performance.now();
    const delay = this.getDelayForCurrentState();
    return now - this.lastStateChange > delay;
  }

  nextState(): VaquitaAnimationState {
    const probabilities: [VaquitaAnimationState, number][] = [
      ['working', 0.1],
      ['walking', 0.8],
      ['sleeping', 0.2],
    ];

    const next = this.weightedRandom(probabilities);
    this.state = next;
    this.lastStateChange = performance.now();
    return next;
  }

  getDelayForCurrentState(): number {
    switch (this.state) {
      case 'walking':
        return 40000; // 40s
      case 'working':
        return 50000; // 50s
      case 'sleeping':
        return 20000; // 20s
      default:
        return 0;
    }
  }

  updatePosition(pos: [number, number]) {
    this.position = pos;
  }

  private weightedRandom(weights: [VaquitaAnimationState, number][]): VaquitaAnimationState {
    const total = weights.reduce((acc, [, prob]) => acc + prob, 0);
    const rand = Math.random() * total;

    let sum = 0;
    for (const [state, prob] of weights) {
      sum += prob;
      if (rand <= sum) {
        return state;
      }
    }

    // ✅ Esto garantiza que siempre retorna
    return weights.at(-1)?.[0] ?? 'walking'; // o un valor por defecto seguro
  }
}

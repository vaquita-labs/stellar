import { VaquitaAnimationState } from '@/core-ui/types';

const WAKE_OVERRIDE_MS = 8000;

export class VaquitaBrain {
  public state: VaquitaAnimationState;
  private overrideUntil: number = 0;
  private overrideState: VaquitaAnimationState | null = null;
  private personalityOffset: number;

  constructor(initial: VaquitaAnimationState = 'walking') {
    this.state = initial;
    this.personalityOffset = (Math.random() - 0.5) * 0.04;
  }

  tick(dayProgress: number) {
    const now = performance.now();
    if (this.overrideState && now < this.overrideUntil) {
      this.state = this.overrideState;
      return this.state;
    }
    if (this.overrideState && now >= this.overrideUntil) {
      this.overrideState = null;
    }
    this.state = this.scheduledStateFor(dayProgress);
    return this.state;
  }

  forceState(state: VaquitaAnimationState, durationMs: number = WAKE_OVERRIDE_MS) {
    this.overrideState = state;
    this.overrideUntil = performance.now() + durationMs;
    this.state = state;
  }

  private scheduledStateFor(dayProgress: number): VaquitaAnimationState {
    const p = (dayProgress + this.personalityOffset + 1) % 1;
    if (p >= 0.9 || p < 0.07) return 'sleeping';
    if (p < 0.3) return 'working';
    if (p < 0.55) return 'walking';
    if (p < 0.78) return 'working';
    return 'walking';
  }
}

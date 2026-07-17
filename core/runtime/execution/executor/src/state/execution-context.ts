import { createHash } from 'node:crypto'

export class ExecutionContext {
  private _currentStep = 0
  private readonly _outputs = new Map<number, unknown>()
  private readonly _completedSteps: number[] = []
  private readonly _variables = new Map<string, unknown>()

  constructor(
    readonly executionId: string,
    readonly planId: string,
  ) {}

  get currentStep(): number { return this._currentStep }
  get completedSteps(): readonly number[] { return [...this._completedSteps] }

  advanceStep(): void { this._currentStep++ }
  markCompleted(position: number): void {
    if (!this._completedSteps.includes(position)) this._completedSteps.push(position)
  }

  setOutput(position: number, output: unknown): void { this._outputs.set(position, output) }
  getOutput(position: number): unknown { return this._outputs.get(position) }
  allOutputs(): Readonly<Record<number, unknown>> {
    return Object.fromEntries(this._outputs.entries())
  }

  setVariable(key: string, value: unknown): void { this._variables.set(key, value) }
  getVariable(key: string): unknown { return this._variables.get(key) }

  hash(): string {
    const state = {
      executionId: this.executionId,
      planId: this.planId,
      currentStep: this._currentStep,
      completedSteps: [...this._completedSteps].sort(),
      outputs: Object.fromEntries([...this._outputs.entries()].sort((a, b) => a[0] - b[0])),
    }
    return createHash('sha256').update(JSON.stringify(state)).digest('hex')
  }
}

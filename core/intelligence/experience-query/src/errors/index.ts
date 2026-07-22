export class ExperienceQueryValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExperienceQueryValidationError'
  }
}

export class ExperienceQueryIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExperienceQueryIntegrityError'
  }
}

export class ExperienceQueryUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExperienceQueryUnavailableError'
  }
}

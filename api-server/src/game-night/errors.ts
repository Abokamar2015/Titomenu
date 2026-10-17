export class GameNightDomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GameNightDomainError";
    this.code = code;
  }
}
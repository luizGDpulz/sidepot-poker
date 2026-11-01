export type PokerErrorCode =
  | 'INVALID_CONFIG'
  | 'INVALID_CHIP_AMOUNT'
  | 'INVALID_SEAT_INDEX'
  | 'SEAT_OCCUPIED'
  | 'DUPLICATE_PLAYER_ID'
  | 'PLAYER_NOT_FOUND'
  | 'HAND_IN_PROGRESS'
  | 'HAND_NOT_IN_PROGRESS'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_PLAYERS_TURN'
  | 'ILLEGAL_ACTION'
  | 'INVALID_BET_AMOUNT'
  | 'NOT_IN_SHOWDOWN'
  | 'INVALID_SHOWDOWN_WINNERS'
  | 'REBUY_NOT_ALLOWED'
  | 'ADDON_NOT_ALLOWED'
  | 'INVALID_BLIND_LEVEL'
  | 'NOTHING_TO_UNDO';

export class PokerDomainError extends Error {
  public readonly code: PokerErrorCode;

  public constructor(code: PokerErrorCode, message: string) {
    super(message);
    this.name = 'PokerDomainError';
    this.code = code;
  }
}

export function assertNonNegativeIntegerChips(
  value: number,
  label: string,
): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PokerDomainError(
      'INVALID_CHIP_AMOUNT',
      `${label} must be a non-negative safe integer (received ${String(value)})`,
    );
  }
}

export function assertPositiveIntegerChips(
  value: number,
  label: string,
): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PokerDomainError(
      'INVALID_CHIP_AMOUNT',
      `${label} must be a positive safe integer (received ${String(value)})`,
    );
  }
}

// Converts to the string format the <input type="datetime-local"> value prop expects.
export function toDatetimeLocalValue(date: Date): string {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}

export function defaultDepartureTime(): string {
  return toDatetimeLocalValue(new Date());
}

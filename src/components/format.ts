export const signed = (value: number, digits = 1) =>
  Math.abs(value) < 0.5 * 10 ** -digits ? (0).toFixed(digits) :
    (value > 0 ? '+' : '−') + Math.abs(value).toFixed(digits);

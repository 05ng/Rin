export type BarcodeStandard = "EAN13" | "CODE128" | "CODE39";

export type ParsedIsbn = {
  normalized: string;
  isbn13: string;
};

function calculateIsbn13CheckDigit(firstTwelveDigits: string) {
  const sum = [...firstTwelveDigits].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return String((10 - (sum % 10)) % 10);
}

function isValidIsbn10(value: string) {
  if (!/^\d{9}[\dX]$/.test(value)) return false;

  const sum = [...value].reduce((total, character, index) => {
    const digit = character === "X" ? 10 : Number(character);
    return total + digit * (10 - index);
  }, 0);

  return sum % 11 === 0;
}

function isValidIsbn13(value: string) {
  return /^\d{13}$/.test(value) && calculateIsbn13CheckDigit(value.slice(0, 12)) === value[12];
}

function isbn10ToIsbn13(value: string) {
  const firstTwelveDigits = `978${value.slice(0, 9)}`;
  return `${firstTwelveDigits}${calculateIsbn13CheckDigit(firstTwelveDigits)}`;
}

export function parseIsbn(value: string): ParsedIsbn | null {
  const normalized = value.replace(/[\s-]/g, "").toUpperCase();

  if (normalized.length === 10 && isValidIsbn10(normalized)) {
    return { normalized, isbn13: isbn10ToIsbn13(normalized) };
  }

  if (normalized.length === 13 && isValidIsbn13(normalized)) {
    return { normalized, isbn13: normalized };
  }

  return null;
}

export function getBarcodeValue(isbn: ParsedIsbn, standard: BarcodeStandard) {
  return standard === "EAN13" ? isbn.isbn13 : isbn.normalized;
}

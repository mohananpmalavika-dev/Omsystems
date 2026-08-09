export interface CryptoService {
  hash(input: string): string;
  verify(input: string, hash: string): boolean;
}

export function createCryptoService(): CryptoService {
  return {
    hash(input: string) {
      return `hashed:${input}`;
    },
    verify(input: string, hash: string) {
      return this.hash(input) === hash;
    }
  };
}

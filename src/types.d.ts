declare global {
  interface Window {
    __electricityI18n?: {
      language: string;
      dictionary: Record<string, unknown>;
      setLanguage(nextLanguage: string): Promise<void>;
      t(key: string, values?: Record<string, string | number>): string;
    };
  }
}

export {};

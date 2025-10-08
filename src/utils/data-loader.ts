import { readFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "./logger";

type BadwordsData = {
  strict: string[];
  moderate: string[];
  variants: string[];
  descriptions: Record<string, string>;
};

type WhitelistLinksData = {
  social_media: string[];
  discord: string[];
  streaming: string[];
  development: string[];
  media: string[];
  documentation: string[];
  gaming: string[];
  design: string[];
  trusted: string[];
  descriptions: Record<string, string>;
};

const DATA_DIR = join(__dirname, "..", "data");

const loadJsonFile = <T>(filename: string): T => {
  try {
    const filePath = join(DATA_DIR, filename);
    const fileContent = readFileSync(filePath, "utf-8");
    return JSON.parse(fileContent) as T;
  } catch (error) {
    logger.error(`Failed to load ${filename}:`, error);
    throw new Error(`Failed to load data file: ${filename}`);
  }
};

const normalizeText = (text: string): string =>
  text.toLowerCase().replace(/\s+/g, "");

const createVariantPatterns = (words: string[]): RegExp[] =>
  words.map(
    (word) =>
      new RegExp(
        word
          .split("")
          .map((char) => {
            if (char.match(/[a-z]/i)) {
              return `[${char}${char.replace(/[aeiou]/gi, (v) => {
                const variants: Record<string, string> = {
                  a: "4@",
                  e: "3",
                  i: "1!",
                  o: "0",
                  u: "",
                };
                return variants[v.toLowerCase()] || v;
              })}]`;
            }
            return char;
          })
          .join("[._-]?"),
        "gi"
      )
  );

class DataLoader {
  private static instance: DataLoader;
  private badwordsData: BadwordsData | null = null;
  private whitelistData: WhitelistLinksData | null = null;
  private badwordPatterns: RegExp[] = [];

  private constructor() {
    this.loadData();
  }

  static getInstance(): DataLoader {
    if (!DataLoader.instance) {
      DataLoader.instance = new DataLoader();
    }
    return DataLoader.instance;
  }

  private loadData(): void {
    try {
      this.badwordsData = loadJsonFile<BadwordsData>("badwords.json");
      this.whitelistData = loadJsonFile<WhitelistLinksData>(
        "whitelist-links.json"
      );

      this.generateBadwordPatterns();

      logger.info("✅ Data files loaded successfully");
      logger.info(`📝 Badwords: ${this.getAllBadwords().length} words loaded`);
      logger.info(
        `🔗 Whitelisted domains: ${
          this.getAllWhitelistedDomains().length
        } domains loaded`
      );
    } catch (error) {
      logger.error("Failed to load data files:", error);
      throw error;
    }
  }

  private generateBadwordPatterns(): void {
    if (!this.badwordsData) return;

    const allWords = [
      ...this.badwordsData.strict,
      ...this.badwordsData.moderate,
      ...this.badwordsData.variants,
    ];

    this.badwordPatterns = createVariantPatterns(allWords);
  }

  getAllBadwords(): string[] {
    if (!this.badwordsData) return [];
    return [
      ...this.badwordsData.strict,
      ...this.badwordsData.moderate,
      ...this.badwordsData.variants,
    ];
  }

  getStrictBadwords(): string[] {
    return this.badwordsData?.strict || [];
  }

  getModerateBadwords(): string[] {
    return this.badwordsData?.moderate || [];
  }

  containsBadword(text: string): boolean {
    const normalizedText = normalizeText(text);

    const exactMatch = this.getAllBadwords().some((word) =>
      normalizedText.includes(normalizeText(word))
    );

    if (exactMatch) return true;

    return this.badwordPatterns.some((pattern) => pattern.test(text));
  }

  getAllWhitelistedDomains(): string[] {
    if (!this.whitelistData) return [];
    return Object.values(this.whitelistData)
      .filter((value) => Array.isArray(value))
      .flat();
  }

  getWhitelistByCategory(
    category: keyof Omit<WhitelistLinksData, "descriptions">
  ): string[] {
    return this.whitelistData?.[category] || [];
  }

  isUrlWhitelisted(url: string): boolean {
    const allDomains = this.getAllWhitelistedDomains();
    return allDomains.some((domain) => url.includes(domain));
  }

  reloadData(): void {
    logger.info("Reloading data files...");
    this.badwordsData = null;
    this.whitelistData = null;
    this.badwordPatterns = [];
    this.loadData();
  }
}

export const dataLoader = DataLoader.getInstance();

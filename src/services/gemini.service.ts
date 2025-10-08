import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "@/utils/logger";
import { cfg } from "@/utils/config";
import {
  generateFriendlyResponsePrompt,
  generateMorningTemplatesPrompt,
  generateRandomChatPrompt,
  generateWarningTemplatesPrompt,
  generateWelcomeTemplatesPrompt,
} from "@/data/prompts";

const RATE_LIMIT_DURATION_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 15;
const MODEL_NAME = "gemini-2.5-flash";

const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.8,
  maxOutputTokens: 200,
};

type KeyUsageWindow = {
  timestamps: number[];
  rateLimitedUntil: number;
};

export class GeminiService {
  private static instance: GeminiService;
  private currentKeyIndex = 0;
  private keyUsageWindows = new Map<number, KeyUsageWindow>();

  private constructor() {
    this.initializeKeyTracking();
    logger.info(`✅ Initialized ${cfg.GEMINI_API_KEYS.length} Gemini API keys`);
  }

  static getInstance(): GeminiService {
    if (!GeminiService.instance) {
      GeminiService.instance = new GeminiService();
    }
    return GeminiService.instance;
  }

  private initializeKeyTracking(): void {
    cfg.GEMINI_API_KEYS.forEach((_, index) => {
      this.keyUsageWindows.set(index, {
        timestamps: [],
        rateLimitedUntil: 0,
      });
    });
  }

  private cleanOldTimestamps(window: KeyUsageWindow): void {
    const oneMinuteAgo = Date.now() - RATE_LIMIT_DURATION_MS;
    window.timestamps = window.timestamps.filter((ts) => ts > oneMinuteAgo);
  }

  private isKeyAvailable(index: number): boolean {
    const window = this.keyUsageWindows.get(index);
    if (!window) return false;

    // Check if manually rate limited
    if (window.rateLimitedUntil > Date.now()) {
      return false;
    }

    // Clean old timestamps
    this.cleanOldTimestamps(window);

    // Check if under rate limit
    return window.timestamps.length < MAX_REQUESTS_PER_MINUTE;
  }

  private recordKeyUsage(index: number): void {
    const window = this.keyUsageWindows.get(index);
    if (!window) return;

    this.cleanOldTimestamps(window);
    window.timestamps.push(Date.now());

    logger.debug(
      `Using Gemini API key #${index + 1}, requests in last minute: ${
        window.timestamps.length
      }/${MAX_REQUESTS_PER_MINUTE}`
    );
  }

  private getNextApiKey(): string {
    const maxAttempts = cfg.GEMINI_API_KEYS.length;

    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      const index = this.currentKeyIndex;

      if (this.isKeyAvailable(index)) {
        const key = cfg.GEMINI_API_KEYS[index];
        this.recordKeyUsage(index);
        this.currentKeyIndex =
          (this.currentKeyIndex + 1) % cfg.GEMINI_API_KEYS.length;
        return key;
      }

      logger.debug(`API key #${index + 1} is not available, trying next...`);
      this.currentKeyIndex =
        (this.currentKeyIndex + 1) % cfg.GEMINI_API_KEYS.length;
    }

    throw new Error(
      "All Gemini API keys have reached rate limit (15 requests/minute). Please wait."
    );
  }

  private markKeyAsRateLimited(keyIndex: number): void {
    const window = this.keyUsageWindows.get(keyIndex);
    if (!window) return;

    const resetTime = Date.now() + RATE_LIMIT_DURATION_MS;
    window.rateLimitedUntil = resetTime;

    logger.warn(
      `API key #${keyIndex + 1} manually rate limited until ${new Date(
        resetTime
      ).toISOString()}`
    );
  }

  private isRateLimitError(error: any): boolean {
    return error.message?.includes("429") || error.message?.includes("quota");
  }

  private extractJsonArray(response: string): string[] {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found in response");
    return JSON.parse(jsonMatch[0]);
  }

  private extractWarningTemplates(
    response: string
  ): Array<{ type: string; content: string; severity: string }> {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found in response");

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) throw new Error("Response is not an array");

      return parsed.map((item) => {
        if (!item.type || !item.content || !item.severity) {
          throw new Error("Invalid template structure");
        }
        return {
          type: item.type,
          content: item.content,
          severity: item.severity,
        };
      });
    } catch (error) {
      logger.error("Failed to parse warning templates:", error);
      throw new Error("Failed to parse AI response for warning templates");
    }
  }

  private extractMorningTemplates(
    response: string
  ): Array<{ content: string; moodTag: string }> {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found in response");

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) throw new Error("Response is not an array");

      return parsed.map((item) => {
        if (!item.content || !item.moodTag) {
          throw new Error("Invalid template structure");
        }
        return {
          content: item.content,
          moodTag: item.moodTag,
        };
      });
    } catch (error) {
      logger.error("Failed to parse morning templates:", error);
      throw new Error("Failed to parse AI response for morning templates");
    }
  }

  async generate(
    prompt: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    const maxRetries = cfg.GEMINI_API_KEYS.length;
    let lastError: Error | null = null;

    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        const apiKey = this.getNextApiKey();
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature:
              options?.temperature ?? DEFAULT_GENERATION_CONFIG.temperature,
            maxOutputTokens:
              options?.maxTokens ?? DEFAULT_GENERATION_CONFIG.maxOutputTokens,
          },
        });

        const text = result.response.text();
        logger.info("Generated text from Gemini", { length: text.length });
        return text;
      } catch (error: any) {
        lastError = error;
        logger.error("Gemini generation error:", error);

        if (this.isRateLimitError(error)) {
          const failedKeyIndex =
            (this.currentKeyIndex - 1 + cfg.GEMINI_API_KEYS.length) %
            cfg.GEMINI_API_KEYS.length;
          this.markKeyAsRateLimited(failedKeyIndex);
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error("Failed to generate text after all retries");
  }

  async generateWelcomeTemplates(count = 50): Promise<string[]> {
    const prompt = generateWelcomeTemplatesPrompt(count);

    const response = await this.generate(prompt, {
      temperature: 0.9,
      maxTokens: 3000,
    });

    try {
      const templates = this.extractJsonArray(response);
      logger.info(`Generated ${templates.length} welcome templates`);
      return templates;
    } catch (error) {
      logger.error("Failed to parse welcome templates:", error);
      throw new Error("Failed to parse AI response");
    }
  }

  async generateWarningTemplates(
    count = 20
  ): Promise<Array<{ type: string; content: string; severity: string }>> {
    const prompt = generateWarningTemplatesPrompt(count);

    const response = await this.generate(prompt, {
      temperature: 0.9,
      maxTokens: 3000,
    });

    try {
      const templates = this.extractWarningTemplates(response);
      logger.info(`Generated ${templates.length} warning templates`);
      return templates;
    } catch (error) {
      logger.error("Failed to parse warning templates:", error);
      throw new Error("Failed to parse AI response");
    }
  }

  async generateMorningTemplates(
    count = 20
  ): Promise<Array<{ content: string; moodTag: string }>> {
    const prompt = generateMorningTemplatesPrompt(count);

    const response = await this.generate(prompt, {
      temperature: 0.9,
      maxTokens: 3000,
    });

    try {
      const templates = this.extractMorningTemplates(response);
      logger.info(`Generated ${templates.length} morning templates`);
      return templates;
    } catch (error) {
      logger.error("Failed to parse morning templates:", error);
      throw new Error("Failed to parse AI response");
    }
  }

  async generateFriendlyResponse(
    question: string,
    context?: string
  ): Promise<string> {
    const prompt = generateFriendlyResponsePrompt(question, context);
    return this.generate(prompt, { temperature: 0.8, maxTokens: 200 });
  }

  async generateRandomChatMessage(): Promise<string> {
    const topics = [
      "sharing a coffee/tea thought",
      "gentle mood check",
      "random wholesome observation",
      "encouraging thought",
      "casual friendly comment",
      "sharing a cozy vibe",
    ];

    const topic = topics[Math.floor(Math.random() * topics.length)];

    const prompt = generateRandomChatPrompt(topic);

    return this.generate(prompt, { temperature: 0.95, maxTokens: 100 });
  }

  getUsageStats() {
    const now = Date.now();
    return cfg.GEMINI_API_KEYS.map((_, index) => {
      const window = this.keyUsageWindows.get(index);
      if (!window) {
        return {
          keyIndex: index + 1,
          requestsInLastMinute: 0,
          rateLimited: false,
          availableSlots: MAX_REQUESTS_PER_MINUTE,
        };
      }

      this.cleanOldTimestamps(window);

      return {
        keyIndex: index + 1,
        requestsInLastMinute: window.timestamps.length,
        rateLimited: window.rateLimitedUntil > now,
        availableSlots: MAX_REQUESTS_PER_MINUTE - window.timestamps.length,
        rateLimitedUntil:
          window.rateLimitedUntil > now
            ? new Date(window.rateLimitedUntil).toISOString()
            : null,
      };
    });
  }
}

export const geminiService = GeminiService.getInstance();

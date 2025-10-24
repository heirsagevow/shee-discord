import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import { logger } from "@/utils/logger";
import { cfg } from "@/utils/config";
import {
  generateMorningTemplatesPrompt,
  generateRandomChatPrompt,
  generateWarningTemplatesPrompt,
  generateWelcomeTemplatesPrompt,
} from "@/data/prompts";

const RATE_LIMIT_DURATION_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 15;
const MODEL_NAME = "gemini-2.5-flash"; // Use the valid model
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

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

    if (window.rateLimitedUntil > Date.now()) {
      return false;
    }

    this.cleanOldTimestamps(window);
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
    return (
      error.message?.includes("429") ||
      error.message?.includes("quota") ||
      error.message?.includes("RATE_LIMIT")
    );
  }

  private isEmptyResponse(text: string): boolean {
    const cleaned = text.trim();
    return (
      cleaned.length === 0 ||
      cleaned === '""' ||
      cleaned === "''" ||
      cleaned === "{}" ||
      cleaned === "[]"
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async generate(
    prompt: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      try {
        if (retry > 0) {
          logger.info(`Retry attempt ${retry}/${MAX_RETRIES}...`);
          await this.delay(RETRY_DELAY_MS * retry);
        }

        const apiKey = this.getNextApiKey();
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: MODEL_NAME,
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
          ],
        });

        logger.debug(`Sending prompt (${prompt.length} chars) to Gemini...`);

        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature:
              options?.temperature ?? DEFAULT_GENERATION_CONFIG.temperature,
            maxOutputTokens:
              options?.maxTokens ?? DEFAULT_GENERATION_CONFIG.maxOutputTokens,
          },
        });

        const response = result.response;

        // Debug: Log full response object including candidates
        const candidate = response.candidates?.[0];
        logger.debug("Gemini response object:", {
          candidates: response.candidates?.length,
          promptFeedback: response.promptFeedback,
          finishReason: candidate?.finishReason,
          safetyRatings: candidate?.safetyRatings,
          hasContent: !!candidate?.content,
          contentParts: candidate?.content?.parts?.length,
        });

        // Check if response was blocked
        if (response.promptFeedback?.blockReason) {
          logger.error("Prompt was blocked:", {
            blockReason: response.promptFeedback.blockReason,
            safetyRatings: response.promptFeedback.safetyRatings,
          });
          lastError = new Error(
            `Prompt blocked: ${response.promptFeedback.blockReason}`
          );
          continue;
        }

        // Check finish reason
        const finishReason = candidate?.finishReason;
        if (finishReason && finishReason !== "STOP") {
          logger.error("Response blocked or incomplete:", {
            finishReason,
            safetyRatings: candidate?.safetyRatings,
            blockReasonMessage:
              candidate?.content?.parts?.[0]?.text || "No text",
          });

          // If blocked by safety, continue to retry
          if (finishReason === "SAFETY" || finishReason === "RECITATION") {
            lastError = new Error(`Response blocked: ${finishReason}`);
            continue;
          }

          // If max tokens, also retry with higher limit
          if (finishReason === "MAX_TOKENS") {
            logger.warn("Hit max tokens limit, continuing anyway...");
          }
        }

        const text = response.text();

        logger.debug(`Raw Gemini response (${text.length} chars):`, {
          preview: text.substring(0, 200),
          fullText: text,
        });

        if (this.isEmptyResponse(text)) {
          logger.warn(
            `Empty response from AI (attempt ${retry + 1}/${MAX_RETRIES})`
          );
          lastError = new Error("AI returned empty response");
          continue;
        }

        logger.info("Generated text from Gemini", { length: text.length });
        return text;
      } catch (error: any) {
        lastError = error;
        logger.error(`Gemini generation error (attempt ${retry + 1}):`, {
          error: error.message,
          stack: error.stack,
          name: error.name,
        });

        if (this.isRateLimitError(error)) {
          const failedKeyIndex =
            (this.currentKeyIndex - 1 + cfg.GEMINI_API_KEYS.length) %
            cfg.GEMINI_API_KEYS.length;
          this.markKeyAsRateLimited(failedKeyIndex);
          continue;
        }

        if (retry < MAX_RETRIES - 1) {
          continue;
        }

        throw error;
      }
    }

    throw (
      lastError ||
      new Error(`Failed to generate text after ${MAX_RETRIES} retries`)
    );
  }

  private extractJsonArray(response: string): string[] {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.error(
        "No JSON array found in response:",
        response.substring(0, 200)
      );
      throw new Error("No JSON array found in response");
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        throw new Error("Parsed response is not an array");
      }
      return parsed;
    } catch (error) {
      logger.error("Failed to parse JSON array:", error);
      throw new Error("Failed to parse AI response as JSON array");
    }
  }

  private extractWarningTemplates(
    response: string
  ): Array<{ type: string; content: string; severity: string }> {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.error(
        "No JSON array found in response:",
        response.substring(0, 200)
      );
      throw new Error("No JSON array found in response");
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        throw new Error("Response is not an array");
      }

      return parsed.map((item, index) => {
        if (!item.type || !item.content || !item.severity) {
          logger.error(`Invalid template structure at index ${index}:`, item);
          throw new Error(`Invalid template structure at index ${index}`);
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
    if (!jsonMatch) {
      logger.error(
        "No JSON array found in response:",
        response.substring(0, 200)
      );
      throw new Error("No JSON array found in response");
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        throw new Error("Response is not an array");
      }

      return parsed.map((item, index) => {
        if (!item.content || !item.moodTag) {
          logger.error(`Invalid template structure at index ${index}:`, item);
          throw new Error(`Invalid template structure at index ${index}`);
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

  async generateWelcomeTemplates(count = 50): Promise<string[]> {
    const prompt = generateWelcomeTemplatesPrompt(count);

    const response = await this.generate(prompt, {
      temperature: 0.9,
      maxTokens: 3000,
    });

    const templates = this.extractJsonArray(response);
    logger.info(`Generated ${templates.length} welcome templates`);
    return templates;
  }

  async generateWarningTemplates(
    count = 20
  ): Promise<Array<{ type: string; content: string; severity: string }>> {
    const prompt = generateWarningTemplatesPrompt(count);

    const response = await this.generate(prompt, {
      temperature: 0.9,
      maxTokens: 3000,
    });

    const templates = this.extractWarningTemplates(response);
    logger.info(`Generated ${templates.length} warning templates`);
    return templates;
  }

  async generateMorningTemplates(
    count = 20
  ): Promise<Array<{ content: string; moodTag: string }>> {
    const prompt = generateMorningTemplatesPrompt(count);

    const response = await this.generate(prompt, {
      temperature: 0.9,
      maxTokens: 3000,
    });

    const templates = this.extractMorningTemplates(response);
    logger.info(`Generated ${templates.length} morning templates`);
    return templates;
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

    const response = await this.generate(prompt, {
      temperature: 0.95,
      maxTokens: 100,
    });

    let cleaned = response.trim();
    cleaned = cleaned.replace(/```[\s\S]*?```/g, "");
    cleaned = cleaned.replace(/`[^`]*`/g, "");

    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1);
    }
    if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
      cleaned = cleaned.slice(1, -1);
    }

    cleaned = cleaned.trim();

    if (this.isEmptyResponse(cleaned)) {
      logger.error("Random chat response is empty after cleaning");
      throw new Error("Generated random chat message is empty");
    }

    return cleaned;
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

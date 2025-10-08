import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "@/utils/logger";
import { cfg } from "@/utils/config";

type MoodType = "motivational" | "chill" | "energetic";
type ViolationType = "spam" | "badword" | "link";

const RATE_LIMIT_DURATION_MS = 60 * 60 * 1000;
const MODEL_NAME = "gemini-2.5-flash";

const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.8,
  maxOutputTokens: 200,
};

export class GeminiService {
  private static instance: GeminiService;
  private currentKeyIndex = 0;
  private keyUsageCount = new Map<number, number>();
  private keyRateLimitUntil = new Map<number, number>();

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
      this.keyUsageCount.set(index, 0);
    });
  }

  private isKeyAvailable(index: number): boolean {
    const rateLimitUntil = this.keyRateLimitUntil.get(index) || 0;
    return rateLimitUntil < Date.now();
  }

  private incrementKeyUsage(index: number): void {
    const currentUsage = this.keyUsageCount.get(index) || 0;
    this.keyUsageCount.set(index, currentUsage + 1);
    logger.debug(
      `Using Gemini API key #${index + 1}, usage: ${currentUsage + 1}`
    );
  }

  private getNextApiKey(): string {
    const maxAttempts = cfg.GEMINI_API_KEYS.length;

    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      const index = this.currentKeyIndex;

      if (this.isKeyAvailable(index)) {
        const key = cfg.GEMINI_API_KEYS[index];
        this.incrementKeyUsage(index);
        this.currentKeyIndex =
          (this.currentKeyIndex + 1) % cfg.GEMINI_API_KEYS.length;
        return key;
      }

      this.currentKeyIndex =
        (this.currentKeyIndex + 1) % cfg.GEMINI_API_KEYS.length;
    }

    throw new Error("All Gemini API keys are rate limited. Please wait.");
  }

  private markKeyAsRateLimited(keyIndex: number): void {
    const resetTime = Date.now() + RATE_LIMIT_DURATION_MS;
    this.keyRateLimitUntil.set(keyIndex, resetTime);
    logger.warn(
      `API key #${keyIndex + 1} rate limited until ${new Date(
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
    const prompt = `
      Generate ${count} unique, warm, and friendly welcome messages in Bahasa Indonesia for new Discord members. 

      Requirements:
      - Be casual, inviting, and natural
      - Use coffee/tea metaphors occasionally (☕🍵)
      - Mix formal and informal tones
      - Include some with emojis, some without
      - 1-2 sentences each
      - Vary the energy level (excited, calm, cozy, supportive)

      Format: Return ONLY a JSON array of strings, no other text.

      Example format:
      ["message1", "message2", "message3"]
    `;

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

  async generateMorningMessage(
    mood: MoodType = "motivational"
  ): Promise<string> {
    const moodDescriptions: Record<MoodType, string> = {
      motivational: "motivating and encouraging, full of positive energy",
      chill: "calm, peaceful, and relaxing like a morning coffee",
      energetic: "exciting and energetic, ready to conquer the day",
    };

    const prompt = `
      Generate a single morning greeting message in Bahasa Indonesia that is ${moodDescriptions[mood]}.

      Requirements:
      - 1-2 sentences max
      - Natural and warm tone
      - Include a morning emoji (☀️🌅🌄)
      - Make it feel personal and genuine

      Return ONLY the message text, no quotes or extra formatting.
    `;

    return this.generate(prompt, { temperature: 0.85, maxTokens: 150 });
  }

  async generateFriendlyResponse(
    question: string,
    context?: string
  ): Promise<string> {
    const prompt = `
      Kamu adalah Shee, seorang teman yang hangat, ramah, perhatian, dan ceria di Discord server.
      Personality: friendly, supportive, gentle, loves coffee/tea, uses emojis naturally.

      ${context ? `Context: ${context}` : ""}

      Seseorang bertanya atau mengatakan: "${question}"

      Respond naturally in Bahasa Indonesia:
      - Be helpful and genuine
      - Keep it 1-3 sentences
      - Use 1-2 emojis if appropriate
      - Show warmth and care

      Return ONLY your response, no quotes or labels.
    `;

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

    const prompt = `
      Generate a spontaneous, casual message from Shee to a Discord community in Bahasa Indonesia.

      Topic: ${topic}

      Requirements:
      - Very short (1 sentence max)
      - Natural and conversational
      - Include relevant emoji
      - Feel authentic, not forced
      - Friendly and warm tone

      Return ONLY the message text.
    `;

    return this.generate(prompt, { temperature: 0.95, maxTokens: 100 });
  }

  async generateWarningMessage(
    type: ViolationType,
    userName: string
  ): Promise<string> {
    const violationDescriptions: Record<ViolationType, string> = {
      spam: "sending too many messages too quickly",
      badword: "using inappropriate language",
      link: "sharing unauthorized links",
    };

    const prompt = `
      Generate a gentle but firm warning message in Bahasa Indonesia for a user who is ${violationDescriptions[type]}.

      User: ${userName}

      Tone: warm and understanding, but clear about the rules
      - Don't be harsh or angry
      - Use a friendly reminder approach
      - Include a tea/coffee metaphor if natural
      - Keep it 1-2 sentences
      - Encourage better behavior

      Return ONLY the warning message.
    `;

    return this.generate(prompt, { temperature: 0.7, maxTokens: 150 });
  }

  getUsageStats() {
    const now = Date.now();
    return cfg.GEMINI_API_KEYS.map((_, index) => ({
      keyIndex: index + 1,
      usageCount: this.keyUsageCount.get(index) || 0,
      rateLimited: (this.keyRateLimitUntil.get(index) || 0) > now,
    }));
  }
}

export const geminiService = GeminiService.getInstance();

import {
  morningMessageTemplates,
  warningTemplates,
  welcomeTemplates,
  type NewMorningMessageTemplate,
  type NewWarningTemplate,
  type NewWelcomeTemplate,
} from "@/integrations/drizzle/schemas/discord";
import { logger } from "../utils/logger";
import { sql, asc, count, lt } from "drizzle-orm";
import { db } from "@/integrations/drizzle/db";
import { geminiService } from "./gemini.service";

export class TemplateService {
  private static instance: TemplateService;

  private constructor() {}

  static getInstance(): TemplateService {
    if (!TemplateService.instance) {
      TemplateService.instance = new TemplateService();
    }
    return TemplateService.instance;
  }

  /**
   * Get the least used welcome template
   */
  async getWelcomeTemplate() {
    // Check if we need to generate more templates
    const [{ value: availableCount }] = await db
      .select({ value: count() })
      .from(welcomeTemplates)
      .where(lt(welcomeTemplates.usedCount, 5));

    if (availableCount < 10) {
      logger.info("Low template count, triggering generation...");
      await this.generateWelcomeTemplates();
    }

    // Get least used template
    const [template] = await db
      .select()
      .from(welcomeTemplates)
      .orderBy(
        asc(welcomeTemplates.usedCount),
        asc(welcomeTemplates.lastUsedAt)
      )
      .limit(1);

    if (!template) {
      throw new Error("No welcome templates available");
    }

    // Update usage stats
    await db
      .update(welcomeTemplates)
      .set({
        usedCount: sql`${welcomeTemplates.usedCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(sql`${welcomeTemplates.id} = ${template.id}`);

    return template;
  }

  /**
   * Generate new welcome templates using AI
   */
  async generateWelcomeTemplates(count: number = 50): Promise<void> {
    try {
      logger.info(`Generating ${count} welcome templates...`);
      const templates = await geminiService.generateWelcomeTemplates(count);

      const data: NewWelcomeTemplate[] = templates.map((content) => ({
        content,
        embedData: null,
        usedCount: 0,
      }));

      await db.insert(welcomeTemplates).values(data);
      logger.info(`✅ Generated ${templates.length} welcome templates`);
    } catch (error) {
      logger.error("Failed to generate welcome templates:", error);
      throw error;
    }
  }

  /**
   * Get morning message template
   */
  async getMorningMessageTemplate(
    mood?: "motivational" | "chill" | "energetic"
  ) {
    const query = db
      .select()
      .from(morningMessageTemplates)
      .orderBy(
        asc(morningMessageTemplates.usedCount),
        asc(morningMessageTemplates.lastUsedAt)
      )
      .limit(1);

    const [template] = mood
      ? await query.where(sql`${morningMessageTemplates.moodTag} = ${mood}`)
      : await query;

    if (!template) {
      // Generate on-the-fly if no templates available
      logger.info("No morning template found, generating on-the-fly");
      const content = await geminiService.generateMorningMessage(mood);
      return { content };
    }

    // Update usage
    await db
      .update(morningMessageTemplates)
      .set({
        usedCount: sql`${morningMessageTemplates.usedCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(sql`${morningMessageTemplates.id} = ${template.id}`);

    return template;
  }

  /**
   * Generate morning message templates in batch
   */
  async generateMorningTemplates(count: number = 20): Promise<void> {
    const moods: Array<"motivational" | "chill" | "energetic"> = [
      "motivational",
      "chill",
      "energetic",
    ];

    const perMood = Math.ceil(count / moods.length);
    const data: NewMorningMessageTemplate[] = [];

    for (const mood of moods) {
      for (let i = 0; i < perMood; i++) {
        const content = await geminiService.generateMorningMessage(mood);
        data.push({ content, moodTag: mood });
      }
    }

    await db.insert(morningMessageTemplates).values(data);
    logger.info(`✅ Generated ${data.length} morning message templates`);
  }

  /**
   * Get warning template
   */
  async getWarningTemplate(
    type: "spam" | "badword" | "link"
  ): Promise<NewWarningTemplate> {
    const [template] = await db
      .select()
      .from(warningTemplates)
      .where(sql`${warningTemplates.type} = ${type}`)
      .limit(1);

    if (!template) {
      // Seed defaults if not exists
      await this.seedDefaultWarningTemplates();
      return this.getWarningTemplate(type);
    }

    return template;
  }

  /**
   * Seed default warning templates
   */
  async seedDefaultWarningTemplates(): Promise<void> {
    const defaults: NewWarningTemplate[] = [
      {
        type: "spam",
        content:
          "🍵 Hey {user}, sepertinya kamu lagi terlalu semangat ya? Let's slow down a bit, oke?",
        severity: "soft",
      },
      {
        type: "spam",
        content:
          "☕ {user}, take a breath~ Kita punya waktu kok, gak perlu buru-buru",
        severity: "soft",
      },
      {
        type: "badword",
        content:
          "🌿 {user}, yuk kita jaga kata-kata ya~ Biar tetap sama sama nyaman 💚",
        severity: "soft",
      },
      {
        type: "badword",
        content:
          "🫖 {user}, mungkin coba pakai kata lain ya? Let's keep it friendly here~",
        severity: "soft",
      },
      {
        type: "link",
        content:
          "🔗 {user}, mohon maaf ya~ Link ini belum di-whitelist. Coba tanya mod dulu oke?",
        severity: "soft",
      },
      {
        type: "link",
        content:
          "✨ {user}, untuk keamanan bersama, link-nya aku hapus dulu ya. Kalau penting bisa minta izin ke mod~",
        severity: "soft",
      },
    ];

    await db.insert(warningTemplates).values(defaults);
    logger.info("✅ Seeded default warning templates");
  }

  /**
   * Get template statistics
   */
  async getTemplateStats() {
    const [welcomeCountResult] = await db
      .select({ value: count() })
      .from(welcomeTemplates);

    const [morningCountResult] = await db
      .select({ value: count() })
      .from(morningMessageTemplates);

    const [warningCountResult] = await db
      .select({ value: count() })
      .from(warningTemplates);

    const [totalWelcomeUsageResult] = await db
      .select({
        value: sql<number>`COALESCE(SUM(${welcomeTemplates.usedCount}), 0)`,
      })
      .from(welcomeTemplates);

    return {
      welcome: {
        total: welcomeCountResult.value,
        totalUsage: totalWelcomeUsageResult.value,
      },
      morning: {
        total: morningCountResult.value,
      },
      warning: {
        total: warningCountResult.value,
      },
    };
  }
}

export const templateService = TemplateService.getInstance();

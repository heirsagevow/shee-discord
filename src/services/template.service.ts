import {
  morningMessageTemplates,
  warningTemplates,
  welcomeTemplates,
  type NewMorningMessageTemplate,
  type NewWarningTemplate,
  type NewWelcomeTemplate,
} from "@/integrations/drizzle/schemas/discord";
import { logger } from "@/utils/logger";
import { sql, asc, count, lt } from "drizzle-orm";
import { db } from "@/integrations/drizzle/db";
import { geminiService } from "./gemini.service";

type MoodType = "motivational" | "chill" | "energetic";
type ViolationType = "spam" | "badword" | "link";

const LOW_TEMPLATE_THRESHOLD = 10;
const USAGE_THRESHOLD = 5;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 5000;

export class TemplateService {
  private static instance: TemplateService;
  private isGenerating = false;

  private constructor() {}

  static getInstance(): TemplateService {
    if (!TemplateService.instance) {
      TemplateService.instance = new TemplateService();
    }
    return TemplateService.instance;
  }

  private async getAvailableTemplateCount(): Promise<number> {
    const [{ value }] = await db
      .select({ value: count() })
      .from(welcomeTemplates)
      .where(lt(welcomeTemplates.usedCount, USAGE_THRESHOLD));

    return value;
  }

  private async checkAndGenerateTemplatesIfNeeded(): Promise<void> {
    if (this.isGenerating) return;

    const availableCount = await this.getAvailableTemplateCount();

    if (availableCount < LOW_TEMPLATE_THRESHOLD) {
      logger.info("Low template count, triggering generation...");
      this.generateWelcomeTemplates(20).catch((err) =>
        logger.error("Background template generation failed:", err)
      );
    }
  }

  private async getLeastUsedTemplate() {
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

    return template;
  }

  private async markTemplateAsUsed(templateId: number): Promise<void> {
    await db
      .update(welcomeTemplates)
      .set({
        usedCount: sql`${welcomeTemplates.usedCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(sql`${welcomeTemplates.id} = ${templateId}`);
  }

  async getWelcomeTemplate() {
    await this.checkAndGenerateTemplatesIfNeeded();
    const template = await this.getLeastUsedTemplate();
    await this.markTemplateAsUsed(template.id);
    return template;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async generateWelcomeTemplates(count = 20): Promise<void> {
    if (this.isGenerating) {
      logger.warn("Template generation already in progress, skipping...");
      return;
    }

    try {
      this.isGenerating = true;
      logger.info(`Starting batch generation of ${count} welcome templates...`);

      const batches = Math.ceil(count / BATCH_SIZE);
      let totalGenerated = 0;

      for (let i = 0; i < batches; i++) {
        const batchCount = Math.min(BATCH_SIZE, count - totalGenerated);

        try {
          const templates = await geminiService.generateWelcomeTemplates(
            batchCount
          );

          const data: NewWelcomeTemplate[] = templates.map((content) => ({
            content,
            embedData: null,
            usedCount: 0,
          }));

          await db.insert(welcomeTemplates).values(data);
          totalGenerated += templates.length;

          logger.info(
            `✅ Batch ${i + 1}/${batches}: Generated ${
              templates.length
            } templates (Total: ${totalGenerated}/${count})`
          );

          if (i < batches - 1) {
            await this.delay(BATCH_DELAY_MS);
          }
        } catch (error) {
          logger.error(`Failed to generate batch ${i + 1}:`, error);
          if (i === 0) throw error;
        }
      }

      logger.info(
        `✅ Completed: Generated ${totalGenerated} welcome templates`
      );
    } catch (error) {
      logger.error("Failed to generate welcome templates:", error);
      throw error;
    } finally {
      this.isGenerating = false;
    }
  }

  private async findMorningTemplate(mood?: MoodType) {
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

    return template;
  }

  private async generateMorningMessageOnTheFly(mood?: MoodType) {
    logger.info("No morning template found, generating on-the-fly");
    const content = await geminiService.generateMorningMessage(mood);
    return { content };
  }

  private async markMorningTemplateAsUsed(templateId: number): Promise<void> {
    await db
      .update(morningMessageTemplates)
      .set({
        usedCount: sql`${morningMessageTemplates.usedCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(sql`${morningMessageTemplates.id} = ${templateId}`);
  }

  async getMorningMessageTemplate(mood?: MoodType) {
    const template = await this.findMorningTemplate(mood);

    if (!template) {
      return this.generateMorningMessageOnTheFly(mood);
    }

    await this.markMorningTemplateAsUsed(template.id);
    return template;
  }

  async generateMorningTemplates(count = 20): Promise<void> {
    const moods: MoodType[] = ["motivational", "chill", "energetic"];
    const perMood = Math.ceil(count / moods.length);

    logger.info(`Generating ${count} morning templates in batches...`);

    for (const mood of moods) {
      const batches = Math.ceil(perMood / BATCH_SIZE);

      for (let i = 0; i < batches; i++) {
        const batchCount = Math.min(BATCH_SIZE, perMood - i * BATCH_SIZE);
        const data: NewMorningMessageTemplate[] = [];

        for (let j = 0; j < batchCount; j++) {
          try {
            const content = await geminiService.generateMorningMessage(mood);
            data.push({ content, moodTag: mood });
            await this.delay(1000);
          } catch (error) {
            logger.error(
              `Failed to generate morning template (${mood}):`,
              error
            );
          }
        }

        if (data.length > 0) {
          await db.insert(morningMessageTemplates).values(data);
          logger.info(`✅ Generated ${data.length} ${mood} morning templates`);
        }

        if (i < batches - 1) {
          await this.delay(BATCH_DELAY_MS);
        }
      }
    }

    logger.info("✅ Completed morning template generation");
  }

  async getWarningTemplate(type: ViolationType): Promise<NewWarningTemplate> {
    const [template] = await db
      .select()
      .from(warningTemplates)
      .where(sql`${warningTemplates.type} = ${type}`)
      .limit(1);

    if (!template) {
      await this.seedDefaultWarningTemplates();
      return this.getWarningTemplate(type);
    }

    return template;
  }

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

  private async getTotalUsageCount(): Promise<number> {
    const [result] = await db
      .select({
        value: sql<number>`COALESCE(SUM(${welcomeTemplates.usedCount}), 0)`,
      })
      .from(welcomeTemplates);

    return result.value;
  }

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

    const totalUsage = await this.getTotalUsageCount();

    return {
      welcome: {
        total: welcomeCountResult.value,
        totalUsage,
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

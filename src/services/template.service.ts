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

  private async getAvailableMorningTemplateCount(
    mood?: MoodType
  ): Promise<number> {
    const [{ value }] = await db
      .select({ value: count() })
      .from(morningMessageTemplates)
      .where(
        mood
          ? sql`${morningMessageTemplates.usedCount} < ${USAGE_THRESHOLD} AND ${morningMessageTemplates.moodTag} = ${mood}`
          : sql`${morningMessageTemplates.usedCount} < ${USAGE_THRESHOLD}`
      );

    return value;
  }

  private async checkAndGenerateMorningTemplatesIfNeeded(
    mood?: MoodType
  ): Promise<void> {
    if (this.isGenerating) return;

    const availableCount = await this.getAvailableMorningTemplateCount(mood);

    if (availableCount < LOW_TEMPLATE_THRESHOLD) {
      logger.info(
        `Low morning template count for mood ${
          mood || "any"
        }, triggering generation...`
      );
      this.generateMorningTemplates(20).catch((err) =>
        logger.error("Background morning template generation failed:", err)
      );
    }
  }

  private async getLeastUsedMorningTemplate(mood?: MoodType) {
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
      throw new Error("No morning templates available");
    }

    return template;
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
    await this.checkAndGenerateMorningTemplatesIfNeeded(mood);
    const template = await this.getLeastUsedMorningTemplate(mood);
    await this.markMorningTemplateAsUsed(template.id);
    return template;
  }

  async generateMorningTemplates(count = 20): Promise<void> {
    if (this.isGenerating) {
      logger.warn("Template generation already in progress, skipping...");
      return;
    }

    try {
      this.isGenerating = true;
      logger.info(`Starting batch generation of ${count} morning templates...`);

      const moods: MoodType[] = ["motivational", "chill", "energetic"];
      const perMood = Math.ceil(count / moods.length);

      for (const mood of moods) {
        const batches = Math.ceil(perMood / BATCH_SIZE);
        let totalGenerated = 0;

        for (let i = 0; i < batches; i++) {
          const batchCount = Math.min(BATCH_SIZE, perMood - totalGenerated);

          try {
            const templates = await geminiService.generateMorningTemplates(
              batchCount
            );

            const data: NewMorningMessageTemplate[] = templates.map(
              ({ content, moodTag }) => ({
                content,
                moodTag: moodTag as MoodType,
                usedCount: 0,
              })
            );

            await db.insert(morningMessageTemplates).values(data);
            totalGenerated += templates.length;

            logger.info(
              `✅ Batch ${i + 1}/${batches}: Generated ${
                templates.length
              } ${mood} templates (Total: ${totalGenerated}/${perMood})`
            );

            if (i < batches - 1) {
              await this.delay(BATCH_DELAY_MS);
            }
          } catch (error) {
            logger.error(
              `Failed to generate batch ${i + 1} for ${mood}:`,
              error
            );
            if (i === 0) throw error;
          }
        }
      }

      logger.info(`✅ Completed: Generated morning templates for all moods`);
    } catch (error) {
      logger.error("Failed to generate morning templates:", error);
      throw error;
    } finally {
      this.isGenerating = false;
    }
  }

  private async getAvailableWarningTemplateCount(
    type: ViolationType
  ): Promise<number> {
    const [{ value }] = await db
      .select({ value: count() })
      .from(warningTemplates)
      .where(sql`${warningTemplates.type} = ${type}`);

    return value;
  }

  private async checkAndGenerateWarningTemplatesIfNeeded(
    type: ViolationType
  ): Promise<void> {
    if (this.isGenerating) return;

    const availableCount = await this.getAvailableWarningTemplateCount(type);

    if (availableCount < LOW_TEMPLATE_THRESHOLD) {
      logger.info(
        `Low warning template count for type ${type}, triggering generation...`
      );
      this.generateWarningTemplates(20).catch((err) =>
        logger.error("Background warning template generation failed:", err)
      );
    }
  }

  private async getLeastUsedWarningTemplate(type: ViolationType) {
    const [template] = await db
      .select()
      .from(warningTemplates)
      .where(sql`${warningTemplates.type} = ${type}`)
      .orderBy(
        asc(warningTemplates.usedCount),
        asc(warningTemplates.lastUsedAt)
      )
      .limit(1);

    if (!template) {
      throw new Error(`No warning templates available for type: ${type}`);
    }

    return template;
  }

  private async markWarningTemplateAsUsed(templateId: number): Promise<void> {
    await db
      .update(warningTemplates)
      .set({
        usedCount: sql`${warningTemplates.usedCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(sql`${warningTemplates.id} = ${templateId}`);
  }

  async getWarningTemplate(type: ViolationType) {
    await this.checkAndGenerateWarningTemplatesIfNeeded(type);
    const template = await this.getLeastUsedWarningTemplate(type);
    await this.markWarningTemplateAsUsed(template.id);
    return template;
  }

  async generateWarningTemplates(count = 20): Promise<void> {
    if (this.isGenerating) {
      logger.warn("Template generation already in progress, skipping...");
      return;
    }

    try {
      this.isGenerating = true;
      logger.info(`Starting batch generation of ${count} warning templates...`);

      const batches = Math.ceil(count / BATCH_SIZE);
      let totalGenerated = 0;

      for (let i = 0; i < batches; i++) {
        const batchCount = Math.min(BATCH_SIZE, count - totalGenerated);

        try {
          const templates = await geminiService.generateWarningTemplates(
            batchCount
          );

          const data: NewWarningTemplate[] = templates.map(
            ({ type, content, severity }) => ({
              type: type as ViolationType,
              content,
              severity,
              usedCount: 0,
            })
          );

          await db.insert(warningTemplates).values(data);
          totalGenerated += templates.length;

          logger.info(
            `✅ Batch ${i + 1}/${batches}: Generated ${
              templates.length
            } warning templates (Total: ${totalGenerated}/${count})`
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
        `✅ Completed: Generated ${totalGenerated} warning templates`
      );
    } catch (error) {
      logger.error("Failed to generate warning templates:", error);
      throw error;
    } finally {
      this.isGenerating = false;
    }
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

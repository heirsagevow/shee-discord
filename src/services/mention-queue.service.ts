// import type { Message } from "discord.js";
// import { logger } from "@/utils/logger";
// import { geminiService } from "./gemini.service";
// import {
//   getErrorMessageProcessingMessage,
//   getFallbackResponseMessage,
// } from "@/data/messages";

// type QueueItem = {
//   message: Message;
//   content: string;
//   timestamp: number;
//   retries: number;
// };

// const MAX_RETRIES = 3;
// const PROCESSING_TIMEOUT_MS = 30000; // 30 seconds
// const QUEUE_CLEANUP_INTERVAL_MS = 60000; // 1 minute

// export class MentionQueueService {
//   private static instance: MentionQueueService;
//   private guildQueues = new Map<string, QueueItem[]>();
//   private processing = new Map<string, boolean>();
//   private lastProcessed = new Map<string, number>();

//   private constructor() {
//     this.startCleanupInterval();
//   }

//   static getInstance(): MentionQueueService {
//     if (!MentionQueueService.instance) {
//       MentionQueueService.instance = new MentionQueueService();
//     }
//     return MentionQueueService.instance;
//   }

//   private startCleanupInterval(): void {
//     setInterval(() => {
//       this.cleanupStaleQueues();
//     }, QUEUE_CLEANUP_INTERVAL_MS);
//   }

//   private cleanupStaleQueues(): void {
//     const now = Date.now();
//     for (const [guildId, queue] of this.guildQueues.entries()) {
//       const validItems = queue.filter(
//         (item) => now - item.timestamp < PROCESSING_TIMEOUT_MS * 2
//       );

//       if (validItems.length === 0) {
//         this.guildQueues.delete(guildId);
//         this.processing.delete(guildId);
//       } else if (validItems.length !== queue.length) {
//         this.guildQueues.set(guildId, validItems);
//       }
//     }
//   }

//   private getQueue(guildId: string): QueueItem[] {
//     if (!this.guildQueues.has(guildId)) {
//       this.guildQueues.set(guildId, []);
//     }
//     return this.guildQueues.get(guildId)!;
//   }

//   private isProcessing(guildId: string): boolean {
//     return this.processing.get(guildId) || false;
//   }

//   private setProcessing(guildId: string, value: boolean): void {
//     this.processing.set(guildId, value);
//   }

//   private isDuplicate(guildId: string, messageId: string): boolean {
//     const queue = this.getQueue(guildId);
//     return queue.some((item) => item.message.id === messageId);
//   }

//   private async sendTyping(message: Message): Promise<void> {
//     try {
//       if (message.channel.isTextBased() && !message.channel.isDMBased()) {
//         await message.channel.sendTyping();
//       }
//     } catch (error) {
//       logger.debug("Failed to send typing indicator:", error);
//     }
//   }

//   private validatePrompt(content: string): boolean {
//     if (!content || content.trim().length === 0) {
//       logger.warn("Empty content provided to AI");
//       return false;
//     }

//     if (content.length > 2000) {
//       logger.warn("Content too long for AI processing");
//       return false;
//     }

//     return true;
//   }

//   private cleanResponse(response: string): string {
//     // Remove markdown formatting
//     let cleaned = response.replace(/```[\s\S]*?```/g, "");
//     cleaned = cleaned.replace(/`[^`]*`/g, "");

//     // Remove JSON formatting
//     cleaned = cleaned.replace(/^\s*{[\s\S]*}\s*$/g, "");
//     cleaned = cleaned.replace(/^\s*"response"\s*:\s*"(.*)"\s*$/g, "$1");

//     // Remove quotes if the entire response is wrapped in quotes
//     cleaned = cleaned.replace(/^["'](.*)["']$/g, "$1");

//     // Trim whitespace
//     cleaned = cleaned.trim();

//     return cleaned;
//   }

//   private async generateResponse(
//     content: string,
//     retryCount: number
//   ): Promise<string | null> {
//     try {
//       if (!this.validatePrompt(content)) {
//         logger.error("Invalid prompt content");
//         return null;
//       }

//       logger.info(
//         `Generating AI response (attempt ${retryCount + 1}/${MAX_RETRIES})...`
//       );
//       logger.debug(`Prompt: "${content.substring(0, 100)}..."`);

//       const rawResponse = await geminiService.generateFriendlyResponse(content);

//       logger.debug(`Raw AI response: "${rawResponse}"`);

//       if (!rawResponse || rawResponse.trim().length === 0) {
//         logger.warn(`Empty response from AI (attempt ${retryCount + 1})`);
//         return null;
//       }

//       const cleaned = this.cleanResponse(rawResponse);

//       if (!cleaned || cleaned.length === 0) {
//         logger.warn(
//           `Response became empty after cleaning (attempt ${retryCount + 1})`
//         );
//         return null;
//       }

//       logger.info(`AI response generated successfully: "${cleaned}"`);
//       return cleaned;
//     } catch (error) {
//       logger.error(
//         `Error generating AI response (attempt ${retryCount + 1}):`,
//         error
//       );
//       return null;
//     }
//   }

//   private async processQueueItem(
//     guildId: string,
//     item: QueueItem
//   ): Promise<void> {
//     const { message, content, retries } = item;

//     try {
//       await this.sendTyping(message);

//       const response = await this.generateResponse(content, retries);

//       if (!response) {
//         if (retries < MAX_RETRIES - 1) {
//           logger.info(
//             `Retrying for message ${message.id} (${retries + 1}/${MAX_RETRIES})`
//           );
//           item.retries++;
//           this.getQueue(guildId).unshift(item); // Put back at front of queue
//           return;
//         }

//         logger.error(
//           `Failed to generate response after ${MAX_RETRIES} attempts`
//         );
//         await message.reply({
//           content: getFallbackResponseMessage(),
//           allowedMentions: { repliedUser: true },
//         });
//         return;
//       }

//       await message.reply({
//         content: response,
//         allowedMentions: { repliedUser: true },
//       });

//       logger.info(
//         `Successfully sent AI response to ${message.author.tag} in guild ${guildId}`
//       );
//     } catch (error) {
//       logger.error(`Error processing mention queue item:`, error);

//       if (retries < MAX_RETRIES - 1) {
//         item.retries++;
//         this.getQueue(guildId).unshift(item);
//       } else {
//         try {
//           await message.reply({
//             content: getErrorMessageProcessingMessage(),
//             allowedMentions: { repliedUser: true },
//           });
//         } catch (replyError) {
//           logger.error("Failed to send error message:", replyError);
//         }
//       }
//     }
//   }

//   private async processQueue(guildId: string): Promise<void> {
//     if (this.isProcessing(guildId)) {
//       logger.debug(`Queue already processing for guild ${guildId}`);
//       return;
//     }

//     this.setProcessing(guildId, true);

//     try {
//       const queue = this.getQueue(guildId);

//       while (queue.length > 0) {
//         const item = queue.shift();
//         if (!item) break;

//         // Check if message is too old
//         const age = Date.now() - item.timestamp;
//         if (age > PROCESSING_TIMEOUT_MS) {
//           logger.warn(
//             `Skipping stale message ${item.message.id} (${Math.round(
//               age / 1000
//             )}s old)`
//           );
//           continue;
//         }

//         await this.processQueueItem(guildId, item);
//         this.lastProcessed.set(guildId, Date.now());

//         // Small delay between messages to prevent rate limiting
//         await new Promise((resolve) => setTimeout(resolve, 500));
//       }
//     } catch (error) {
//       logger.error(`Error processing queue for guild ${guildId}:`, error);
//     } finally {
//       this.setProcessing(guildId, false);
//     }
//   }

//   async addToQueue(message: Message, content: string): Promise<void> {
//     const guildId = message.guildId;
//     if (!guildId) {
//       logger.warn("Message has no guild ID, skipping queue");
//       return;
//     }

//     // Check for duplicates
//     if (this.isDuplicate(guildId, message.id)) {
//       logger.debug(`Duplicate message ${message.id} detected, skipping`);
//       return;
//     }

//     const queueItem: QueueItem = {
//       message,
//       content,
//       timestamp: Date.now(),
//       retries: 0,
//     };

//     const queue = this.getQueue(guildId);
//     queue.push(queueItem);

//     logger.info(
//       `Added message to queue for guild ${guildId} (queue size: ${queue.length})`
//     );

//     // Start processing if not already running
//     if (!this.isProcessing(guildId)) {
//       this.processQueue(guildId);
//     }
//   }

//   getQueueStats() {
//     const stats: Record<
//       string,
//       { queueSize: number; isProcessing: boolean; lastProcessed: number | null }
//     > = {};

//     for (const [guildId, queue] of this.guildQueues.entries()) {
//       stats[guildId] = {
//         queueSize: queue.length,
//         isProcessing: this.isProcessing(guildId),
//         lastProcessed: this.lastProcessed.get(guildId) || null,
//       };
//     }

//     return stats;
//   }
// }

// export const mentionQueueService = MentionQueueService.getInstance();

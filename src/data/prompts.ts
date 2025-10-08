export const generateWelcomeTemplatesPrompt = (count: number) => {
  return `
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
};

export const generateMorningMessagePrompt = (moodDescription: string) => {
  return `
      Generate a single morning greeting message in Bahasa Indonesia that is ${moodDescription}.

      Requirements:
      - 1-2 sentences max
      - Natural and warm tone
      - Include a morning emoji (☀️🌅🌄)
      - Make it feel personal and genuine

      Return ONLY the message text, no quotes or extra formatting.
    `;
};

export const generateFriendlyResponsePrompt = (
  question: string,
  context?: string
) => {
  return `
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
};

export const generateRandomChatPrompt = (topic: string) => {
  return `
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
};

export const generateWarningMessagePrompt = (
  userName: string,
  violationDescription: string
) => {
  return `
        Generate a gentle but firm warning message in Bahasa Indonesia for a user who is ${violationDescription}.
  
        User: ${userName}
  
        Tone: warm and understanding, but clear about the rules
        - Don't be harsh or angry
        - Use a friendly reminder approach
        - Include a tea/coffee metaphor if natural
        - Keep it 1-2 sentences
        - Encourage better behavior
  
        Return ONLY the warning message.
      `;
};

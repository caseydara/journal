// src/lib/promptBuilder.js
export function buildPromptsForToday(recentEntries = []) {
    const defaultPrompts = [
      "What happened today? Tell me a short summary.",
      "What's one thing you're grateful for today?",
      "What's one thing you learned or want to remember?"
    ];
  
    if (!recentEntries || recentEntries.length === 0) return defaultPrompts;
  
    const yesterday = recentEntries[0];
  
    // Normalize takeaways to a single string.
    let yesterdayText = '';
    if (yesterday) {
      if (Array.isArray(yesterday.takeaways)) {
        yesterdayText = yesterday.takeaways.join(' ');
      } else if (typeof yesterday.takeaways === 'string') {
        yesterdayText = yesterday.takeaways;
      } else if (yesterday.summary && typeof yesterday.summary === 'string') {
        yesterdayText = yesterday.summary;
      } else if (yesterday.raw && Array.isArray(yesterday.raw) && yesterday.raw[0]?.text) {
        yesterdayText = yesterday.raw[0].text;
      }
    }
  
    const possibleTopic = yesterdayText
      .split(/[.?!\n]/)[0]
      .slice(0, 120)
      .trim();
  
    const followUp = possibleTopic
      ? `Yesterday you said: "${possibleTopic}". How did that go today?`
      : null;
  
    const prompts = [];
    if (followUp) prompts.push(followUp);
    prompts.push("How are you feeling right now on a scale of 1 to 10?");
    prompts.push("Is there anything you'd like to remember from today?");
    return prompts.concat(defaultPrompts).slice(0, 6);
  }
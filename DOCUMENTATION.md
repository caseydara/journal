# 📝 AI Journaling Assistant – Design Documentation

## 1. Overview
The AI Journaling App is a **React web application** that guides users through daily reflective prompts using a personal assistant. The assistant builds continuity across entries, referencing past reflections to encourage deeper insights. It also tracks **mood trends and daily takeaways**.

---

## 2. Goals
- Encourage daily journaling through a realistic **journaling companion** and **AI-guided prompts**.  
- Provide continuity by referencing past entries.  
- Help users track **emotional well-being** over time.  
- Deliver insights and summaries for personal growth.  

---

## 3. Core Features
1. **Daily Prompts & Conversation Flow**
   - Chat-style interface with an AI journaling coach.  
   - Personalized questions that adapt based on prior responses.  

2. **Journal Entry Storage**
   - Save daily entries with associated metadata (date, prompt, response, mood, takeaway).  

3. **Mood & Takeaways Tracking**
   - Extract user mood and major lessons  
   - Visualize mood trends over time (charts).  

4. **History & Insights**
   - List or timeline of past entries.  
   - Weekly/monthly AI-generated summaries.  
---

## 4. Technical Stack

### Frontend
- **Framework:** React  
- **HUME Speech to Speech (EVI):** Real-time, customizable voice intelligence powered by empathic AI.
- **Navigation:** React Navigation  

### Backend
  - Local storage with `AsyncStorage`

### 5. Future Enhancements

- **Smarter Voice Assistant**  
  Reduce repetitive follow-up questions and enable a more natural conversation style. 

- **Journal File Upload & Import**  
  Allow users to upload text or PDF files from their personal journals, automatically parsing them into structured entries. This lets users migrate existing journaling habits into the app.

- **Advanced Dashboard & Insights**  
  Provide trend analysis with interactive graphs (e.g., sentiment heatmaps, weekly comparison reports). Users can filter insights by tags or time periods.

- **Enhanced Security & Account Management**  
  Implement end-to-end encryption, multi-factor authentication, and biometric login (Face ID/Touch ID).

- **Customizable Journaling Modes**  
  Offer themed modes like Gratitude Journal, Productivity Tracker, or Dream Journal. Each mode could have tailored prompts and AI insights.

- **Weekly/Monthly AI Reflections**  
  Generate richer summaries that highlight recurring themes, progress on personal goals, and suggested areas for focus.

- **Multi-Language Support**  
  Add the ability to journal in multiple languages and provide translations or bilingual prompts.

- **Accessibility & Disability Support**  
  Improve inclusivity with features such as screen reader compatibility, high-contrast themes, adjustable font sizes, dyslexia-friendly fonts, and voice-only journaling modes. These enhancements would ensure the app is usable by people with visual, auditory, or motor impairments.

- **Integrations with Calendar & Wellness Apps**  
  Sync key reflections or mood logs with Google Calendar, Apple Health, or mental health apps to encourage holistic tracking.

# 📝 AI Journaling Assistant – Design Documentation

## 1. Overview
The AI Journaling App is a **React Native mobile application** that guides users through daily reflective prompts using a personal assistant. The assistant builds continuity across entries, referencing past reflections to encourage deeper insights. It also tracks **mood trends, daily takeaways, and journaling streaks**.

---

## 2. Goals
- Encourage daily journaling through **AI-guided prompts**.  
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
   - Extract user mood and major lessons using AI.  
   - Visualize mood trends over time (charts).  

4. **History & Insights**
   - List or timeline of past entries.  
   - Weekly/monthly AI-generated summaries.  

5. **Reminders & Streaks**
   - Daily notifications to encourage consistency.  
   - Display journaling streaks as motivation.  

---

## 4. Technical Stack

### Frontend
- **Framework:** React Native (Expo for fast development).  
- **UI Library:** React Native Paper / Native Base for components.  
- **Navigation:** React Navigation (stack + bottom tabs).  
- **State Management:** Redux Toolkit or React Query (for async state).  

### Backend
- **Option A (Simple MVP):**  
  - Local storage with `AsyncStorage` or SQLite.  
- **Option B (Scalable):**  
  - Node.js / Express backend or Supabase/Firebase.  
  - Cloud DB (Postgres, Firestore) for syncing across devices.  

### Database Schema (simplified)
```sql
JournalEntry {
  id: UUID (Primary Key)
  date: Date
  prompt: Text
  response: Text
  mood: String
  takeaway: Text
}

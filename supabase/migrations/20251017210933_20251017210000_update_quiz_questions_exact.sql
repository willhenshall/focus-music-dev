/*
  # Update Quiz Questions to Exact Specifications
  
  1. Overview
    - Updates all 21 quiz questions to match the exact wording provided
    - Maintains proper question order and types
    - Updates answer options to match specifications
    
  2. Changes
    - Question 1 (avatar_1): Sound preference question with 4 options
    - Question 2 (avatar_2): Stimulant intake with 4 levels
    - Questions 3-12 (tipi_1 to tipi_10): TIPI personality questions (7-point scale)
    - Questions 13-14: Melody/voice preference (5-point scale)
    - Questions 15-21: Context questions (age, work setting, focus duration, etc.)
*/

-- Clear existing questions
DELETE FROM quiz_questions;

-- Question 1: Sound preference
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('avatar_1', 1, 'single_select', 'When you''re trying to focus, which kind of sound works best for you?', 
 '[{"value": "rhythmic_low_emotion", "label": "Rhythmic, steady beats with very little emotional expression"}, 
   {"value": "melodic_emotional", "label": "Melodic or emotional music that changes mood and feeling"}, 
   {"value": "ambient_nature", "label": "Ambient soundscapes or nature sounds"}, 
   {"value": "no_preference", "label": "No preference / it depends"}]', false);

-- Question 2: Stimulant intake
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('avatar_2', 2, 'single_select', 'What''s your coffee or stimulant intake like?', 
 '[{"value": "none", "label": "None"}, 
   {"value": "little", "label": "A little"}, 
   {"value": "medium", "label": "Medium"}, 
   {"value": "lot", "label": "A lot"}]', false);

-- Questions 3-12: TIPI personality questions (7-point Likert scale)
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('tipi_1', 3, 'likert_1_7', 'I see myself as… Extraverted, enthusiastic.', '[]', false),
('tipi_2', 4, 'likert_1_7', 'I see myself as… Critical, quarrelsome.', '[]', true),
('tipi_3', 5, 'likert_1_7', 'I see myself as… Dependable, self-disciplined.', '[]', false),
('tipi_4', 6, 'likert_1_7', 'I see myself as… Anxious, easily upset.', '[]', false),
('tipi_5', 7, 'likert_1_7', 'I see myself as… Open to new experiences, complex.', '[]', false),
('tipi_6', 8, 'likert_1_7', 'I see myself as… Reserved, quiet.', '[]', true),
('tipi_7', 9, 'likert_1_7', 'I see myself as… Sympathetic, warm.', '[]', false),
('tipi_8', 10, 'likert_1_7', 'I see myself as… Disorganized, careless.', '[]', true),
('tipi_9', 11, 'likert_1_7', 'I see myself as… Calm, emotionally stable.', '[]', true),
('tipi_10', 12, 'likert_1_7', 'I see myself as… Conventional, uncreative.', '[]', true);

-- Questions 13-14: Preference questions (5-point Likert scale)
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('no_melody_pref', 13, 'likert_1_5', 'While working, I prefer sounds without melody or lyrics (e.g., drums, machine hum, noise).', '[]', false),
('voices_distract', 14, 'likert_1_5', 'Voices or emotive melodies distract me when I''m concentrating.', '[]', false);

-- Question 15: Age band
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('context_1', 15, 'single_select', 'Age band', 
 '[{"value": "under_20", "label": "Under 20"}, 
   {"value": "20s", "label": "20s"}, 
   {"value": "30s", "label": "30s"}, 
   {"value": "40s", "label": "40s"}, 
   {"value": "50_plus", "label": "50 and older"}]', false);

-- Question 16: Work setting
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('context_2', 16, 'single_select', 'Typical work setting', 
 '[{"value": "quiet_office", "label": "Quiet office"}, 
   {"value": "busy_office", "label": "Busy office"}, 
   {"value": "home_chatter", "label": "Home with some background chatter"}, 
   {"value": "cafes_public", "label": "Cafés or public spaces"}, 
   {"value": "headphones_always", "label": "Headphones always"}]', false);

-- Question 17: Focus duration
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('focus_duration', 17, 'single_select', 'How long can you usually focus for without taking a break?', 
 '[{"value": "15_min", "label": "15 minutes or less"}, 
   {"value": "30_min", "label": "30 minutes"}, 
   {"value": "45_min", "label": "45 minutes"}, 
   {"value": "1_hour", "label": "1 hour"}, 
   {"value": "1_5_hours", "label": "1.5 hours"}, 
   {"value": "2_plus_hours", "label": "2+ hours"}]', false);

-- Question 18: Current activity
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('current_activity', 18, 'single_select', 'What best describes how you spend most of your day?', 
 '[{"value": "creative_content", "label": "Creating content/designing/writing"}, 
   {"value": "analytical", "label": "Coding, analyzing, teaching"}, 
   {"value": "management", "label": "Managing teams/projects"}, 
   {"value": "studying", "label": "Studying or early career"}, 
   {"value": "other", "label": "None of the above"}]', false);

-- Question 19: Best focus time
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('best_focus_time', 19, 'single_select', 'What time of day do you focus best?', 
 '[{"value": "early_morning", "label": "Early morning (5-8am)"}, 
   {"value": "morning", "label": "Morning (8-12pm)"}, 
   {"value": "afternoon", "label": "Afternoon (12-5pm)"}, 
   {"value": "evening", "label": "Evening (5-9pm)"}, 
   {"value": "night", "label": "Night (9pm+)"}]', false);

-- Question 20: Music frequency
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('music_frequency', 20, 'single_select', 'How often do you use focus music?', 
 '[{"value": "every_day", "label": "Every day"}, 
   {"value": "several_week", "label": "Several times a week"}, 
   {"value": "occasionally", "label": "Occasionally"}, 
   {"value": "rarely", "label": "Rarely"}, 
   {"value": "first_time", "label": "This is my first time"}]', false);

-- Question 21: Focus preference
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('focus_preference', 21, 'single_select', 'What helps you focus most?', 
 '[{"value": "background_music", "label": "Background music"}, 
   {"value": "complete_silence", "label": "Complete silence"}, 
   {"value": "nature_sounds", "label": "Nature sounds"}, 
   {"value": "ambient_noise", "label": "Ambient noise"}, 
   {"value": "varies", "label": "It varies"}]', false);
/*
  # Populate Quiz System with Initial Data
  
  1. Overview
    - Populates the quiz_questions table with the 21 TIPI-based questions from the JSON
    - Inserts the quiz configuration including scoring logic and channel family mappings
    
  2. Quiz Questions
    Creates 21 questions in specific order:
    - TIPI questions (1-10): Personality assessment
    - Avatar questions (11-12): Sound preference indicators
    - Preference questions (13-21): Focus preferences and context
    
  3. Quiz Configuration
    - Stores personality scoring formulas (OCEAN model)
    - Stores channel family definitions and base weights
    - Stores preference modifiers and adjustment rules
    - Stores the complete recommendation algorithm
    
  4. Security
    - RLS policies already enabled on quiz tables
    - Admin-only write access maintained
*/

-- Clear existing data
DELETE FROM quiz_questions;
DELETE FROM quiz_config;

-- Insert TIPI personality questions (1-10)
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('tipi_1', 1, 'likert_1_7', 'I see myself as extraverted, enthusiastic', '[]', false),
('tipi_2', 2, 'likert_1_7', 'I see myself as critical, quarrelsome', '[]', true),
('tipi_3', 3, 'likert_1_7', 'I see myself as dependable, self-disciplined', '[]', false),
('tipi_4', 4, 'likert_1_7', 'I see myself as anxious, easily upset', '[]', false),
('tipi_5', 5, 'likert_1_7', 'I see myself as open to new experiences, complex', '[]', false),
('tipi_6', 6, 'likert_1_7', 'I see myself as reserved, quiet', '[]', true),
('tipi_7', 7, 'likert_1_7', 'I see myself as sympathetic, warm', '[]', false),
('tipi_8', 8, 'likert_1_7', 'I see myself as disorganized, careless', '[]', true),
('tipi_9', 9, 'likert_1_7', 'I see myself as calm, emotionally stable', '[]', true),
('tipi_10', 10, 'likert_1_7', 'I see myself as conventional, uncreative', '[]', true);

-- Insert avatar/preference questions (11-14)
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('avatar_1', 11, 'single_select', 'When focusing, I prefer sounds that are:', 
 '[{"value": "rhythmic_low_emotion", "label": "Rhythmic and minimal (steady beats, low emotional content)"}, 
   {"value": "melodic_emotional", "label": "Melodic and expressive (emotional, musical)"}, 
   {"value": "ambient_nature", "label": "Ambient or natural (soundscapes, nature sounds)"}, 
   {"value": "no_preference", "label": "No strong preference"}]', false),
('avatar_2', 12, 'likert_1_7', 'I have ADHD or relate to high-stimulation needs', '[]', false),
('no_melody_pref', 13, 'likert_1_7', 'I prefer sounds without melody or vocals', '[]', false),
('voices_distract', 14, 'likert_1_7', 'Voices or lyrics distract me from focusing', '[]', false);

-- Insert context questions (15-21)
INSERT INTO quiz_questions (id, question_order, question_type, question_text, options, reverse_scored) VALUES
('context_1', 15, 'single_select', 'My age range:', 
 '[{"value": "under_30", "label": "Under 30"}, 
   {"value": "30_49", "label": "30-49"}, 
   {"value": "50_plus", "label": "50+"}]', false),
('context_2', 16, 'single_select', 'I typically focus for:', 
 '[{"value": "short_bursts", "label": "Short bursts (15-30 min)"}, 
   {"value": "medium_sessions", "label": "Medium sessions (30-60 min)"}, 
   {"value": "long_stretches", "label": "Long stretches (1+ hours)"}, 
   {"value": "varies", "label": "It varies"}]', false),
('focus_duration', 17, 'single_select', 'My current primary activity:', 
 '[{"value": "creative_content", "label": "Creative work (writing, design, content)"}, 
   {"value": "analytical", "label": "Analytical work (coding, data, research)"}, 
   {"value": "management", "label": "Management tasks (email, planning)"}, 
   {"value": "studying", "label": "Studying or learning"}, 
   {"value": "other", "label": "Other"}]', false),
('current_activity', 18, 'single_select', 'I focus best:', 
 '[{"value": "early_morning", "label": "Early morning (5-8am)"}, 
   {"value": "morning", "label": "Morning (8-11am)"}, 
   {"value": "afternoon", "label": "Afternoon (12-5pm)"}, 
   {"value": "evening", "label": "Evening (5-9pm)"}, 
   {"value": "late_night", "label": "Late night (9pm+)"}, 
   {"value": "no_pattern", "label": "No consistent pattern"}]', false),
('best_focus_time', 19, 'single_select', 'I listen to music while working:', 
 '[{"value": "always", "label": "Always"}, 
   {"value": "often", "label": "Often"}, 
   {"value": "sometimes", "label": "Sometimes"}, 
   {"value": "rarely", "label": "Rarely"}, 
   {"value": "never", "label": "Never / New to this"}]', false),
('music_frequency', 20, 'single_select', 'My ideal focus music is:', 
 '[{"value": "energizing", "label": "Energizing and upbeat"}, 
   {"value": "calming", "label": "Calming and relaxing"}, 
   {"value": "structured", "label": "Structured and predictable"}, 
   {"value": "creative", "label": "Creative and inspiring"}, 
   {"value": "minimal", "label": "Minimal and unobtrusive"}]', false),
('focus_preference', 21, 'single_select', 'I would describe myself as:', 
 '[{"value": "neurotypical", "label": "Neurotypical"}, 
   {"value": "adhd", "label": "ADHD or high-energy"}, 
   {"value": "asd", "label": "Autistic or sensory-sensitive"}, 
   {"value": "unsure", "label": "Unsure / prefer not to say"}]', false);

-- Insert quiz configuration
INSERT INTO quiz_config (version, scoring_logic, channel_mapping, is_active) VALUES
('2.0', 
'{
  "personality_scoring": {
    "extraversion": "(tipi_1 + reverse(tipi_6)) / 2",
    "agreeableness": "(tipi_7 + reverse(tipi_2)) / 2",
    "conscientiousness": "(tipi_3 + reverse(tipi_8)) / 2",
    "neuroticism": "(reverse(tipi_9) + tipi_4) / 2",
    "openness": "(tipi_5 + reverse(tipi_10)) / 2",
    "reverse_score": "8 - score",
    "normalization": "score / 7 (to 0-1 scale)"
  },
  "preference_modifiers": {
    "sound_preference": {
      "rhythmic_low_emotion": {
        "rhythmic": 0.6,
        "classical": -0.3,
        "acoustic": -0.3
      },
      "melodic_emotional": {
        "acoustic": 0.6,
        "classical": 0.6,
        "rhythmic": -0.3
      },
      "ambient_nature": {
        "ambient": 0.6,
        "edm_high": -0.2
      },
      "no_preference": {}
    },
    "adhd_score": {
      "condition": "stimulant_level >= medium",
      "effect": {"naturebeat": 0.4, "edm_high": 0.4}
    },
    "age_nudge": {
      "50_plus": {
        "classical": 0.2,
        "acoustic": 0.2,
        "edm_high": -0.2
      }
    },
    "focus_duration": {
      "short_bursts": {"edm_high": 0.3, "rhythmic": 0.2},
      "medium_sessions": {"lofi": 0.2, "naturebeat": 0.2},
      "long_stretches": {"ambient": 0.3, "classical": 0.3},
      "varies": {}
    },
    "current_activity": {
      "creative_content": {"lofi": 0.4, "acoustic": 0.3},
      "analytical": {"classical": 0.4, "ambient": 0.2},
      "management": {"rhythmic": 0.3, "edm_high": 0.2},
      "studying": {"ambient": 0.3, "classical": 0.3},
      "other": {}
    },
    "best_focus_time": {
      "early_morning": {"classical": 0.2, "acoustic": 0.2},
      "morning": {"naturebeat": 0.2, "lofi": 0.1},
      "afternoon": {"edm_high": 0.2, "rhythmic": 0.2},
      "evening": {"ambient": 0.2, "lofi": 0.2},
      "late_night": {"ambient": 0.3, "lofi": 0.2},
      "no_pattern": {}
    },
    "music_frequency": {
      "always": {"all": 0.1},
      "often": {},
      "sometimes": {"ambient": 0.2, "acoustic": 0.1},
      "rarely": {"ambient": 0.3, "rhythmic": 0.2},
      "never": {"ambient": 0.4, "rhythmic": 0.3}
    },
    "focus_preference": {
      "energizing": {"edm_high": 0.4, "naturebeat": 0.3},
      "calming": {"ambient": 0.4, "acoustic": 0.3},
      "structured": {"classical": 0.4, "rhythmic": 0.3},
      "creative": {"lofi": 0.4, "acoustic": 0.3},
      "minimal": {"ambient": 0.3, "rhythmic": 0.2}
    }
  },
  "asd_calculation": {
    "factors": [
      "sound_pref == rhythmic_low_emotion: +1.0",
      "sound_pref == ambient_nature: +0.5",
      "no_melody_pref >= 4: +0.5",
      "voices_distract >= 4: +0.5"
    ],
    "threshold": 1.0
  }
}',
'{
  "channel_families": {
    "rhythmic": {
      "channels": ["The Grid", "Drums", "HumDrum", "Turbo Drums", "Noise", "Machines"],
      "base_weight": "2*N",
      "description": "Steady rhythmic patterns for focus"
    },
    "lofi": {
      "channels": ["Chinchilla", "The Deep", "Deep Space"],
      "base_weight": "1*E + 1.5*O",
      "description": "Lo-fi beats for creative work"
    },
    "naturebeat": {
      "channels": ["NatureBeat"],
      "base_weight": "2*E + 1*O",
      "description": "Natural rhythms for energy"
    },
    "edm_high": {
      "channels": ["The Drop", "A. D. D. J. Gabba", "PowerTool"],
      "base_weight": "2*E - 1*N",
      "description": "High-energy electronic music"
    },
    "ambient": {
      "channels": ["Atmosphere", "Aquascope", "Tranquility"],
      "base_weight": "2*N + 1.5*O",
      "description": "Ambient soundscapes for calm focus"
    },
    "classical": {
      "channels": ["Symphonica", "The Duke", "Edwardian", "Cinematic"],
      "base_weight": "2*C + 0.5*A",
      "description": "Classical compositions for deep work"
    },
    "acoustic": {
      "channels": ["Organica", "Zen Piano", "Kora"],
      "base_weight": "1*C + 1*A",
      "description": "Organic acoustic sounds"
    }
  }
}',
true);
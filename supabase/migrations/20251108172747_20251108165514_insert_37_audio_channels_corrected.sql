-- Insert 37 audio channels

-- First add missing columns if they don't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audio_channels' AND column_name = 'image_url') THEN
    ALTER TABLE audio_channels ADD COLUMN image_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audio_channels' AND column_name = 'display_order') THEN
    ALTER TABLE audio_channels ADD COLUMN display_order integer;
  END IF;
END $$;

INSERT INTO audio_channels (id, channel_number, channel_name, description, brain_type_affinity, neuroscience_tags, image_url, display_order, created_at) VALUES
('1e79a776-29f3-4317-9a7f-096e2217dcef', 1, 'Tranquility', 'Focus Spa • Esoteric, mystical, and calming soundscapes for an ambient experience.', '{}', '{}', NULL, 3, '2025-10-15 20:55:05.724873+00'),
('0cf548d4-1164-40ad-b545-957f39de45c2', 2, 'Turbo Drums', 'Just drums • Turbo faster tempo! Find your rhythm right here right now. Dial it right in.', '{}', '{}', NULL, 9, '2025-10-15 20:55:06.860166+00'),
('01c1ab7c-2be7-4aa2-a6bf-0fc8addca1d4', 3, 'Zen Piano', 'Piano, meditation • The focus magic happens in the space between the notes.', '{}', '{}', NULL, 5, '2025-10-15 20:55:07.364566+00'),
('2963d82d-e01f-4eb5-bd93-ccb9705cb3f1', 4, 'The Grid', 'Future Trance - Hypnotic, repetitive four to the floor 16th note beats for your subconscious', '{}', '{}', NULL, 6, '2025-10-15 20:55:07.840331+00'),
('944e9f06-a9dd-4d74-8c69-17122fe17dce', 5, 'The Duke', 'Baroque Piano • 17th century Bach on a modern piano tuned for focus.', '{}', '{}', NULL, 10, '2025-10-15 20:55:08.323798+00'),
('c9446d4f-a799-4617-adce-f15f9aa3bc65', 6, 'The Drop', 'Uptempo EDM • Infectious, energetic, dance-floor beats to keep you engaged.', '{}', '{}', NULL, 4, '2025-10-15 20:55:08.885085+00'),
('0d93d121-b8fe-42f5-97e9-59ccfab19e92', 7, 'The Deep', 'Alpha Chill • Deep, luscious downtempo beats. Find your flow on demand for sustained creativity.', '{}', '{}', NULL, 7, '2025-10-15 20:55:09.581635+00'),
('d07d2a2f-88b9-4b35-a203-ac4292e80741', 8, 'Symphonica', 'Classical Plus • Custom mastered orchestral music for improved focus.', '{}', '{}', NULL, 11, '2025-10-15 20:55:10.158997+00'),
('f76d55c8-3ac0-4d0b-8331-6968ada11896', 9, 'Propeller Drone', 'Soundscape, FX • Strap in to the focus zone. Plane engines at 30,000 feet. Binaural surround.', '{}', '{}', NULL, 12, '2025-10-15 20:55:10.76003+00'),
('40e01129-d135-4d2d-a1d4-4fcdf554765f', 10, 'PowerTool', 'ADHD, ADD • Industrial, glitch. Intense, noisy EDM channel scientifically proven to help.', '{}', '{}', NULL, 13, '2025-10-15 20:55:11.240401+00'),
('7ffcf332-74f3-4eba-9f64-d48b3ed8516d', 11, 'Organica', 'Acoustical, organic • Natural, solo performances on guitar and piano by humans.', '{}', '{}', NULL, 8, '2025-10-15 20:55:11.722889+00'),
('1c81b815-8405-4153-96ec-80ec6e1761e0', 12, 'Noise', 'Brown noise. Pink noise. White noise. Focus. Focus. Focus.', '{}', '{}', NULL, 14, '2025-10-15 20:55:12.289959+00'),
('3b6dbdf6-3b97-46a3-9a47-1b3a6186f786', 13, 'NeuroSpace', 'Electronic, sci-fi • Stretch out with future synth tones and textures. Micro tunings.', '{}', '{}', NULL, 15, '2025-10-15 20:55:12.805172+00'),
('a5b113b0-152b-4854-b83e-470a69aaa866', 14, 'Neon 80s', '80s Dance Rewind • A modern take on disco beats, nostalgic synths, and funky guitars straight out of the ''80s.', '{}', '{}', NULL, 16, '2025-10-15 20:55:13.286595+00'),
('d9f3b6df-27e3-4175-89ec-2108153c0bed', 15, 'NatureBeat', 'EDM, hybrid • Deep Electronica wrapped in rich nature soundscapes. Custom engineered for focus.', '{}', '{}', NULL, 1, '2025-10-15 20:55:13.752548+00'),
('05b08fda-7cf3-4dae-bc7b-b7800b0d8aad', 16, 'Machines', 'Let the persistent rattle and hum of these machines keep your focus locked down.', '{}', '{}', NULL, 17, '2025-10-15 20:55:14.26218+00'),
('8189faef-bc6c-4923-8550-27071c98a871', 17, 'Kora', 'World, ethnic • Unique, delicate, inviting African harp recordings. 75 min loop.', '{}', '{}', NULL, 18, '2025-10-15 20:55:14.731531+00'),
('39b20bd0-8779-4d65-adfa-f4022ce22e58', 19, 'Jambient Jungle', 'Drums. Bass. Old school meets new school. Exclusive new channel.', '{}', '{}', NULL, 19, '2025-10-15 20:55:15.638203+00'),
('92b21cca-b584-429b-bbf1-f617112a25d8', 20, 'HumDrum', 'Drums, entrainment: Find your rhythm with no tuned instrument distraction.', '{}', '{}', NULL, 20, '2025-10-15 20:56:39.012188+00'),
('6633d90c-ae5d-4fcf-a55d-e4c17c20bc58', 21, 'HumDrum Turbo', 'Drums. Isotone. • Faster tempo! Find your rhythm with no tuned instrument distraction.', '{}', '{}', NULL, 21, '2025-10-15 20:56:40.239328+00'),
('ebeec8cc-d83f-4a43-b243-88888b526109', 22, 'Evolve', 'Ketamine Flow • "Music is the language of the spirit." Kahlil Gibran', '{}', '{}', NULL, 22, '2025-10-15 20:56:41.556166+00'),
('d6c1ff0d-d1a0-4c06-b98a-4c7f29ac7a16', 23, 'Espresso', 'Ambience, people • Our local coffee shop with binaural entrainment', '{}', '{}', NULL, 23, '2025-10-15 20:56:42.569975+00'),
('ad8000ce-b8b9-4040-9ca9-97b0ae2cd44f', 24, 'Engines', 'The comforting rumble of engines idling.', '{}', '{}', NULL, 24, '2025-10-15 20:56:44.042269+00'),
('366ad907-fe86-4b37-82c8-3a97a19c3707', 25, 'Edwardian', 'Classical Piano • Custom engineered, remastered and re-edited for focus.', '{}', '{}', NULL, 25, '2025-10-15 20:56:45.728692+00'),
('25255f2c-64fc-4564-a916-89efb9d41b30', 26, 'Drums', 'Just drums • Find your rhythm with no tuned instrument distraction. Dial it in.', '{}', '{}', NULL, 26, '2025-10-15 20:56:47.079237+00'),
('d0d6eb9d-02f7-4ef0-9ad7-37e86baec278', 27, 'Deep Space', 'Hypnotic Exploration • Celestial beats for deep daily creativity.', '{}', '{}', NULL, 27, '2025-10-15 20:56:48.358383+00'),
('0c2b2606-0470-473f-a244-a698325f3c2b', 28, 'Cinematic', 'Classical, orchestral • Emotionally connecting and highly evocative.', '{}', '{}', NULL, 28, '2025-10-15 20:56:49.612332+00'),
('53d98d7b-392c-4f67-b20f-67cd1032076f', 29, 'Chinchilla', 'Lo Fi • Foot tapping lounge tunes for getting stuff done at your own speed.', '{}', '{}', NULL, 29, '2025-10-15 20:56:50.873182+00'),
('09031b3f-7297-473e-a6ce-7890c3f63a05', 30, 'Cappuccino', 'Ambience, people • Our other local coffee shop with binaural entrainment', '{}', '{}', NULL, 30, '2025-10-15 20:56:52.106259+00'),
('dce6eb2b-3b79-4d5e-99fc-7d7118270f1a', 31, 'Bongo Turbo', 'Percussion, entrainment • Turbo fast live hand drums. Find your rhythm with organic isochronic beats.', '{}', '{}', NULL, 31, '2025-10-15 20:56:53.075227+00'),
('1c35aace-ae4a-49bf-96f2-40d219adcf57', 32, 'Bongo Flow', 'Percussion, entrainment • Live hand drums. Find your rhythm with organic isochronic beats.', '{}', '{}', NULL, 32, '2025-10-15 20:56:54.387317+00'),
('670698ac-b68a-433b-89b6-2a0b9284d2f1', 33, 'Bach Beats', 'Electro Bach • Preludes, fugues and DJ beats. 1720s chamber strings meet 2020s electronica.', '{}', '{}', NULL, 33, '2025-10-15 20:56:55.677654+00'),
('1d57fc39-4350-4eda-91e2-5b6454a000a4', 34, 'Atmosphere', 'Ambient, soundscapes • Peaceful, mellow, and subtle hypnotic spaces.', '{}', '{}', NULL, 34, '2025-10-15 20:56:57.017292+00'),
('bb0e3c8a-0b58-4081-b0b7-9ad5e4e5a2a5', 35, 'Aquascope', 'Water, nature • Meditative soundscapes featuring rain, waves, streams, and more.', '{}', '{}', NULL, 35, '2025-10-15 20:56:58.178778+00'),
('797a42e9-caf0-40f6-956f-aeea17a020c9', 36, 'Motor Fan Drone', 'Electric motor with a fan knocking on something, Rich Burnett''s genius.', '{}', '{}', NULL, 36, '2025-10-19 20:59:41.757448+00'),
('cad7b2ef-2d88-4d11-abb1-f1333554cc88', 37, 'Haiku Robot', 'Future electronica • Japanese haiku meets space robot transport. ', '{}', '{}', NULL, 2, '2025-11-01 12:41:38.456682+00')
ON CONFLICT (id) DO NOTHING;
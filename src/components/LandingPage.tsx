import { useState } from 'react';
import { Music, Brain, TrendingUp, Users } from 'lucide-react';

type LandingPageProps = {
  onAuthModeChange: (mode: 'signin' | 'signup') => void;
  onStartQuiz: () => void;
};

export function LandingPage({ onAuthModeChange, onStartQuiz }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="fixed top-0 left-0 right-0 z-50 h-20 bg-white/80 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex justify-between items-center">
          <div>
            <span className="text-2xl text-slate-900"><span className="font-bold">focus</span>.music</span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => onAuthModeChange('signin')}
              className="px-6 py-2 text-slate-700 hover:text-slate-900 transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={onStartQuiz}
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto text-center">
            <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-6">
              Music That Matches
              <br />
              <span className="text-slate-600">Your Brain</span>
            </h1>
            <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
              Neuroscience-based productivity music personalized to your unique cognitive profile.
              Take our 21-question quiz and discover your optimal focus soundtrack.
            </p>
            <button
              onClick={onStartQuiz}
              className="px-8 py-4 bg-blue-500 hover:bg-blue-600 text-white text-lg font-semibold rounded-lg transition-colors inline-flex items-center gap-2"
            >
              Start Your Free Assessment
            </button>
          </div>
        </section>

        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white border-y border-slate-200">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
                  <Brain className="text-slate-700" size={32} />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Brain-Type Profiling</h3>
                <p className="text-slate-600">
                  OCEAN personality assessment with ADHD and ASD indicators
                </p>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
                  <Music className="text-slate-700" size={32} />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">37 Unique Channels</h3>
                <p className="text-slate-600">
                  8,600+ tracks across 3 energy levels per channel
                </p>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
                  <TrendingUp className="text-slate-700" size={32} />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Smart Algorithms</h3>
                <p className="text-slate-600">
                  Playlist sequencing based on 640,000 user behavioral patterns
                </p>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
                  <Users className="text-slate-700" size={32} />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Proven Results</h3>
                <p className="text-slate-600">
                  15 years of research-backed effectiveness
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 text-center mb-12">
              How It Works
            </h2>
            <div className="space-y-8">
              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center text-white font-bold text-xl">
                  1
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    Complete the Assessment
                  </h3>
                  <p className="text-slate-600">
                    Answer 21 questions that measure personality traits, cognitive preferences, and
                    music responsiveness. Takes about 5 minutes.
                  </p>
                </div>
              </div>

              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center text-white font-bold text-xl">
                  2
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    Get Your Brain Type
                  </h3>
                  <p className="text-slate-600">
                    Our algorithm analyzes your OCEAN scores and neurodiversity indicators to
                    determine your unique cognitive profile and optimal music parameters.
                  </p>
                </div>
              </div>

              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center text-white font-bold text-xl">
                  3
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    Start Your Flow State
                  </h3>
                  <p className="text-slate-600">
                    Receive personalized channel recommendations and begin streaming music
                    scientifically designed to enhance your focus and productivity.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white border-t border-slate-200">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-6">
              Ready to Unlock Your Focus Potential?
            </h2>
            <p className="text-xl text-slate-600 mb-8">
              Join thousands of users who have discovered their perfect productivity soundtrack
            </p>
            <button
              onClick={() => onAuthModeChange('signup')}
              className="px-8 py-4 bg-blue-500 hover:bg-blue-600 text-white text-lg font-semibold rounded-lg transition-colors"
            >
              Begin Your Journey
            </button>
          </div>
        </section>
      </main>

      <footer className="py-8 px-4 sm:px-6 lg:px-8 border-t border-slate-200 bg-slate-50">
        <div className="max-w-7xl mx-auto text-center text-slate-600">
          <p>© 2025 <span className="font-bold">focus</span>.music - Neuroscience-Based Productivity Music</p>
        </div>
      </footer>
    </div>
  );
}

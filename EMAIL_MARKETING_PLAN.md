# Email Marketing Integration Plan

**Status**: DEFERRED - Focus on channel recommender and core functionality first

**Context**: Focus at Will has 500,000 email subscribers currently on Bayengage.com. Need to migrate to new ESP for next version of the app.

---

## Recommended ESP: **Customer.io**

### Why Customer.io?

1. **Event-Based Segmentation** - Track every interaction (plays, channel preferences, session duration, energy levels)
2. **Custom Attributes** - Store OCEAN scores, psychological profiles, work patterns on user profiles
3. **Behavioral Triggers** - Send emails based on specific behaviors (e.g., "hasn't used Bongo Flow in 7 days")
4. **Visual Campaign Builder** - Complex funnels with branching logic based on rich data
5. **Powerful Segmentation** - Combine demographic, psychographic, and behavioral data
6. **API-First Design** - Easy integration with Supabase via Edge Functions
7. **Scale-Ready** - Handles 500k+ subscribers efficiently

### Alternative: **Klaviyo** (more advanced features, higher cost)

---

## Implementation Split: Your Admin Panel vs Customer.io

### In Your Admin Panel (via Customer.io API):

✅ **Easy & Recommended:**
- Send individual/targeted emails to specific users
- Create/manage segments based on OCEAN scores and usage patterns
- Start/stop automated campaigns
- View campaign performance (opens, clicks, conversions)
- Push user events automatically (track plays, quiz completions)
- Sync OCEAN scores, preferences, subscription status to Customer.io
- Create basic email templates via API

📊 **Admin Panel Would Display:**
- Active campaigns with performance metrics
- Segment definitions and member counts
- Quick actions: "Send upgrade offer to segment X"
- Event tracking status and recent syncs
- User lookup: Customer.io profile + email history

### In Customer.io Interface (Complex Features):

⚠️ **Better Done in Customer.io:**
- Visual email designer (drag-and-drop with rich formatting)
- Complex funnel building (multi-step workflows, branching, A/B tests)
- Advanced A/B testing (subject lines, content, send times)
- Email template management (WYSIWYG editor with dynamic content)
- Deliverability monitoring (bounce handling, spam scores, domain reputation)
- Compliance management (unsubscribe handling, GDPR/CAN-SPAM)
- Deep analytics (attribution, cohort analysis, revenue tracking)

---

## Practical Workflow Examples

### Scenario 1: Onboarding Campaign
- **In Customer.io**: Design email templates, set up 7-day drip sequence
- **In Your Admin**: Enable/disable campaign, view entries, see conversions

### Scenario 2: Targeted Upgrade Offer
- **In Your Admin**: Define segment ("OCEAN Openness 8+, uses Cinematic daily, free tier, 30+ days active")
- **In Customer.io**: Design upgrade email, set up A/B test
- **In Your Admin**: Launch to segment, monitor real-time conversions

### Scenario 3: Re-engagement
- **In Your Admin**: Auto-detect "hasn't played in 7 days" → trigger Customer.io campaign
- **In Customer.io**: Multi-email sequence with personalized recommendations
- **In Your Admin**: Track which users returned and their post-email behavior

---

## Recommended Admin Panel Structure

```
Admin Panel → Email Marketing Tab
├── 📊 Dashboard
│   ├── Active campaigns & stats
│   ├── Recent sends
│   └── Segment sizes
├── 🎯 Segments
│   ├── Create segment (based on your data)
│   ├── Preview members
│   └── Export to Customer.io
├── 🚀 Quick Actions
│   ├── "Send to segment" (use existing template)
│   ├── Trigger automated campaign
│   └── Send test email
├── 📈 Analytics
│   ├── Campaign performance
│   ├── User engagement scores
│   └── Conversion tracking
└── ⚙️ Settings
    ├── API connection status
    ├── Event sync configuration
    └── Default sender settings
```

---

## Architecture Overview

```
Your App (Supabase) → Edge Functions → Customer.io API
                    ↓
User Events:
- Track plays, skips, favorites
- OCEAN quiz results
- Channel preferences
- Energy level patterns
- Subscription changes
                    ↓
Customer.io Segments:
- "High Openness, loves Cinematic"
- "Conscientiousness 8+, morning user"
- "Churning, hasn't played in 5 days"
```

---

## 80/20 Rule Recommendation

### Your Admin Panel (20% effort):
- Campaign triggers
- Segment management
- Performance monitoring
- User data sync

### Customer.io (80% features):
- Email design
- Complex workflows
- Deliverability
- Compliance

**Best Approach**: Design campaigns in Customer.io (better tools), control targeting & triggering from your admin panel (leveraging unique OCEAN + behavioral data), monitor results in your admin panel (integrated with product analytics).

---

## Implementation Steps (When Ready)

1. Set up Customer.io account
2. Create Supabase Edge Functions for API integration
3. Build user event sync (track plays, channel usage, etc.)
4. Sync OCEAN scores and quiz results
5. Build admin panel Email Marketing tab
6. Design initial campaigns in Customer.io
7. Set up automated triggers from admin panel
8. Migrate subscriber list from Bayengage
9. Test with small segment before full rollout

---

## Data to Leverage for Targeting

- **OCEAN Personality Scores** (Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism)
- **Channel Preferences** (most played, favorites, skipped)
- **Energy Level Patterns** (low/medium/high preferences)
- **Usage Patterns** (time of day, session length, frequency)
- **Behavioral Signals** (churning, power users, new users)
- **Subscription Status** (free, paid, trial, churned)
- **Quiz Results** (work style, environment preferences)

---

**Note**: Do not build this until core channel recommender system is complete and tested.

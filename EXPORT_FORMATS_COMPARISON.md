# Audio Tracks Export - Format Comparison Guide

## Question: What's the most reliable format for database migration?

**Answer: SQL is most reliable, JSON is second best, CSV is least reliable.**

---

## Format Comparison

### 🥇 #1: SQL (PostgreSQL INSERT Statements) - **RECOMMENDED**

**Reliability: ⭐⭐⭐⭐⭐ (5/5)**

#### Pros
✅ **Type-safe**: Preserves exact PostgreSQL data types (UUID, JSONB, numeric, timestamptz)
✅ **JSONB native**: metadata column handled natively with `::jsonb` casting
✅ **No parsing needed**: Direct execution in database
✅ **Transaction-wrapped**: All-or-nothing import (data integrity guaranteed)
✅ **No escaping ambiguity**: PostgreSQL handles string escaping properly
✅ **Schema awareness**: SQL naturally matches database schema
✅ **Direct import**: Single command execution
✅ **Verification included**: Built-in verification queries

#### Cons
❌ Large files may need chunking for Supabase SQL Editor
❌ Slightly larger file size than JSON

#### Export Command
```bash
npm run export-audio-tracks-sql
```

#### Output Files
- `audio-tracks-complete-YYYY-MM-DDTHH-MM-SS.sql` - SQL INSERT statements
- `audio-tracks-complete-YYYY-MM-DDTHH-MM-SS.json` - JSON backup
- `audio-tracks-import-YYYY-MM-DDTHH-MM-SS.README.md` - Import instructions

#### Import Methods

**Method 1: Supabase SQL Editor**
1. Open Supabase dashboard → SQL Editor
2. Paste SQL file contents
3. Execute
4. Run verification query

**Method 2: psql Command Line**
```bash
psql "postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres" -f audio-tracks-complete-YYYY-MM-DDTHH-MM-SS.sql
```

**Method 3: Batch Import (for very large files)**
Split SQL file into chunks and execute sequentially.

#### Example SQL Output
```sql
BEGIN;

INSERT INTO audio_tracks (id, channel_id, file_path, energy_level, metadata, ...) VALUES
  ('uuid-1', 'channel-uuid-1', 'path/to/file.mp3', 'medium', '{"track_name":"Song 1","genre":"Rock"}'::jsonb, ...),
  ('uuid-2', 'channel-uuid-2', 'path/to/file2.mp3', 'high', '{"track_name":"Song 2","genre":"Jazz"}'::jsonb, ...),
  ...;

COMMIT;
```

---

### 🥈 #2: JSON - **GOOD ALTERNATIVE**

**Reliability: ⭐⭐⭐⭐ (4/5)**

#### Pros
✅ **Structure preserved**: Nested objects, arrays maintained
✅ **Type preservation**: Numbers, booleans, null handled correctly
✅ **Human readable**: Easy to inspect and debug
✅ **Programmatic import**: Easy to parse and manipulate
✅ **No escaping issues**: JSON standard handles everything

#### Cons
❌ Requires custom import script
❌ No direct database import
❌ Batch logic needed for large datasets
❌ Error handling must be implemented

#### Export Command
```bash
npm run export-audio-tracks
```

#### Output Files
- `audio-tracks-complete-YYYY-MM-DDTHH-MM-SS.json`
- `audio-tracks-complete-YYYY-MM-DDTHH-MM-SS.csv`
- `audio-tracks-export-summary-YYYY-MM-DDTHH-MM-SS.txt`

#### Import Method
```typescript
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabase = createClient(url, serviceRoleKey);
const data = JSON.parse(fs.readFileSync('audio-tracks-complete.json', 'utf-8'));

// Import in batches
const batchSize = 100;
for (let i = 0; i < data.length; i += batchSize) {
  const batch = data.slice(i, i + batchSize);
  const { error } = await supabase.from('audio_tracks').insert(batch);
  if (error) {
    console.error(`Batch ${i / batchSize + 1} failed:`, error);
  } else {
    console.log(`Batch ${i / batchSize + 1} imported (${batch.length} records)`);
  }
}
```

---

### 🥉 #3: CSV - **LEAST RELIABLE**

**Reliability: ⭐⭐ (2/5)**

#### Pros
✅ Universal format (Excel, Google Sheets, any spreadsheet)
✅ Human readable
✅ PostgreSQL COPY command support
✅ Extracted metadata fields for easy access

#### Cons
❌ **JSONB becomes string**: metadata column is stringified JSON, needs parsing
❌ **Type ambiguity**: Everything is text, types must be inferred
❌ **Escaping complexity**: Commas, quotes, newlines require careful handling
❌ **Boolean ambiguity**: `true` vs `"true"` vs `1` vs `"Yes"`
❌ **NULL ambiguity**: Empty string vs "NULL" vs actual NULL
❌ **Precision loss**: Possible for large numbers
❌ **Timestamp formatting**: May require conversion

#### Why CSV is Problematic for Database Import

**Problem 1: JSONB Metadata**
```csv
metadata
"{""track_name"":""Song Name"",""genre"":""Rock""}"
```
↓ Requires parsing and unescaping

**Problem 2: Type Inference**
```csv
duration_seconds,skip_rate,locked
"300","0.15","false"
```
Are these strings or actual types? Database must guess.

**Problem 3: NULL Handling**
```csv
channel_id,deleted_at
"","NULL"
```
Which is actual NULL? Empty string or "NULL" string?

#### When CSV is Useful
- Quick data inspection in Excel/Google Sheets
- Simple filtering and sorting
- Generating reports
- Viewing genre data without coding

#### Export Command
```bash
npm run export-audio-tracks
```

Uses CSV output: `audio-tracks-complete-YYYY-MM-DDTHH-MM-SS.csv`

---

## Recommendation by Use Case

### 🎯 For Database Migration (Future Version Import)
**Use: SQL** (`npm run export-audio-tracks-sql`)
- Most reliable
- Type-safe
- Transaction-wrapped
- Direct import

### 🎯 For Programmatic Processing
**Use: JSON** (`npm run export-audio-tracks`)
- Easy to parse
- Structure preserved
- Good for custom scripts

### 🎯 For Data Analysis/Inspection
**Use: CSV** (`npm run export-audio-tracks`)
- Spreadsheet compatible
- Genre data in separate columns
- Human-friendly

### 🎯 For Backup/Archive
**Use: SQL + JSON** (both)
- SQL for restoration
- JSON for flexibility

---

## File Format Examples

### SQL Format
```sql
INSERT INTO audio_tracks (id, metadata, energy_level) VALUES
  ('550e8400-e29b-41d4-a716-446655440000', '{"track_name":"Test","genre":"Rock"}'::jsonb, 'medium');
```

### JSON Format
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "metadata": {
    "track_name": "Test",
    "genre": "Rock"
  },
  "energy_level": "medium"
}
```

### CSV Format
```csv
id,metadata,metadata_genre,energy_level
550e8400-e29b-41d4-a716-446655440000,"{""track_name"":""Test"",""genre"":""Rock""}",Rock,medium
```

---

## Summary Table

| Feature | SQL | JSON | CSV |
|---------|-----|------|-----|
| **Type Safety** | ✅ Perfect | ✅ Good | ❌ Poor |
| **JSONB Handling** | ✅ Native | ✅ Object | ❌ String |
| **Direct Import** | ✅ Yes | ❌ No | ⚠️ Complex |
| **Transaction Safe** | ✅ Yes | ⚠️ Manual | ⚠️ Manual |
| **File Size** | Medium | Small | Large |
| **Human Readable** | ⚠️ OK | ✅ Yes | ✅ Yes |
| **Spreadsheet Use** | ❌ No | ❌ No | ✅ Yes |
| **Setup Required** | None | Script | Complex |
| **Error Prone** | ⭐ Low | ⭐⭐ Medium | ⭐⭐⭐⭐ High |

---

## Final Answer

**For importing into a future version of this app:**

### 🏆 **Use SQL format** (`npm run export-audio-tracks-sql`)

**Why:**
1. ✅ Exact type preservation (UUID, JSONB, timestamps)
2. ✅ Single-command import (no custom scripts)
3. ✅ Transaction safety (all-or-nothing)
4. ✅ No data loss or ambiguity
5. ✅ Built-in verification

**Backup with JSON** for flexibility and programmatic access if needed.

**Use CSV only** for human inspection, data analysis, or quick checks in spreadsheets.

---

## Quick Start Commands

```bash
# RECOMMENDED: Export as SQL (most reliable)
npm run export-audio-tracks-sql

# Alternative: Export as JSON + CSV (includes both formats)
npm run export-audio-tracks

# For migration, use the .sql file
# For inspection, use the .csv file
# For scripting, use the .json file
```

---

**Conclusion: SQL is the most reliable format for database migration. JSON is good for flexibility. CSV is best for human inspection only.**

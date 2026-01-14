/**
 * Split Trial Set Script
 *
 * Splits an existing trial set into multiple difficulty check sets.
 *
 * Usage:
 *   node scripts/splitTrialsForDifficultyCheck.mjs
 *
 * This will read trial_set_1.json (60 trials) and create:
 *   - difficulty_check_set_1.json (trials 1-10)
 *   - difficulty_check_set_2.json (trials 11-20)
 *   - ...
 *   - difficulty_check_set_6.json (trials 51-60)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TRIALS_PER_SET = 10;
const SOURCE_FILE = 'trial_set_1.json';
const OUTPUT_PREFIX = 'difficulty_check_set_';

function main() {
  const trialsDir = path.join(__dirname, '..', 'src', 'data', 'trials');
  const sourcePath = path.join(trialsDir, SOURCE_FILE);

  console.log('Split Trials for Difficulty Check');
  console.log('==================================\n');

  // Read source file
  if (!fs.existsSync(sourcePath)) {
    console.error(`❌ Source file not found: ${sourcePath}`);
    process.exit(1);
  }

  const sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
  const allTrials = sourceData.trials;

  console.log(`Source file: ${SOURCE_FILE}`);
  console.log(`Total trials: ${allTrials.length}`);
  console.log(`Trials per set: ${TRIALS_PER_SET}`);
  console.log(`Sets to create: ${Math.ceil(allTrials.length / TRIALS_PER_SET)}\n`);

  // Split into sets
  const numSets = Math.ceil(allTrials.length / TRIALS_PER_SET);

  for (let setNum = 1; setNum <= numSets; setNum++) {
    const startIdx = (setNum - 1) * TRIALS_PER_SET;
    const endIdx = Math.min(startIdx + TRIALS_PER_SET, allTrials.length);

    // Extract trials for this set
    const setTrials = allTrials.slice(startIdx, endIdx);

    // Renumber trials 1-10 within each set
    const renumberedTrials = setTrials.map((trial, idx) => ({
      ...trial,
      trialNumber: idx + 1,
      originalTrialNumber: trial.trialNumber, // Keep reference to original
    }));

    // Create new set data
    const setData = {
      setId: setNum,
      baseSeed: sourceData.baseSeed,
      numTrials: renumberedTrials.length,
      trials: renumberedTrials,
      metadata: {
        ...sourceData.metadata,
        generatedAt: new Date().toISOString(),
        sourceFile: SOURCE_FILE,
        originalTrialRange: `${startIdx + 1}-${endIdx}`,
        version: '1.0.0',
      }
    };

    // Write to file
    const filename = `${OUTPUT_PREFIX}${setNum}.json`;
    const filepath = path.join(trialsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(setData, null, 2));

    console.log(`✓ Created ${filename}`);
    console.log(`  Trials: ${startIdx + 1}-${endIdx} → renumbered to 1-${renumberedTrials.length}`);
    console.log(`  Size: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB\n`);
  }

  console.log('==================================');
  console.log(`✓ Split complete! Created ${numSets} difficulty check sets.`);
  console.log('\nUsage URLs:');
  for (let i = 1; i <= numSets; i++) {
    console.log(`  Set ${i}: ?DIFFICULTY_CHECK=true&USE_STATIC_TRIALS=true&TRIAL_SET=${i}`);
  }
}

main();

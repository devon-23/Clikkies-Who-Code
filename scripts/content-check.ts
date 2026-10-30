// Validates the story content the same way the Worker does on startup, and
// prints every problem at once. Run: npm run content:check
import { story } from '../content/story/index.ts';
import { ContentError, buildRegistry } from '../src/worker/content/registry.ts';

try {
  const reg = buildRegistry(story);
  const hidden = reg.evidenceList.filter((e) => e.hidden).length;
  console.log(
    `content ok: ${reg.missions.length} missions, ${reg.evidenceList.length} records (${hidden} hidden), `
    + `${reg.achievementList.length} achievements, ${reg.hiddenCodes.length} hidden codes`,
  );
} catch (err) {
  if (!(err instanceof ContentError)) throw err;
  console.error(err.message);
  process.exit(1);
}

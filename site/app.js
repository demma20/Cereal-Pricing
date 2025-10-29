// app.js
// Usage: node app.js input.txt output.txt
// Input: text file where each line is (ideally) a JSON object; some lines may be partial/broken.
// Output: a .txt file containing a JSON array, one object per line, commas between, wrapped in [].

const fs = require('fs');
const readline = require('readline');
const { once } = require('events');

if (process.argv.length < 4) {
  console.error('Usage: node app.js <input.txt> <output.txt>');
  process.exit(1);
}

const [, , inPath, outPath] = process.argv;

function normalizeRecord(obj) {
  const out = { ...obj };

  // Required fields
  const required = ['date', 'country', 'source', 'metric', 'unit', 'value'];
  for (const k of required) {
    if (!(k in out)) return null;
  }

  // Date -> YYYY-MM-DD
  const d = new Date(out.date);
  if (Number.isNaN(d.getTime())) return null;
  out.date = d.toISOString().slice(0, 10);

  // Strings -> trimmed
  for (const k of ['country', 'source', 'metric', 'unit']) {
    if (typeof out[k] !== 'string') return null;
    out[k] = out[k].trim();
    if (!out[k]) return null;
  }

  // Value -> number
  if (typeof out.value === 'string') {
    const v = Number(out.value.replace(/[, ]+/g, ''));
    if (!Number.isFinite(v)) return null;
    out.value = v;
  } else if (!Number.isFinite(out.value)) {
    return null;
  }

  return out;
}

function dedupeKey(rec) {
  return [
    rec.date,
    rec.country.toLowerCase(),
    rec.source.toLowerCase(),
    rec.metric.toLowerCase(),
    rec.unit.toLowerCase(),
  ].join('|');
}

async function run() {
  const rl = readline.createInterface({
    input: fs.createReadStream(inPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  const map = new Map(); // key -> record (last one wins)
  let lineNum = 0;
  let kept = 0,
    skipped = 0;

  rl.on('line', (line) => {
    lineNum++;
    const trimmed = line.trim();
    if (!trimmed) return;

    // Strip trailing commas (common when pasting array entries line-by-line)
    let maybe = trimmed.replace(/,+\s*$/, '');

    // Ignore array wrappers if the input accidentally includes them
    if (maybe === '[' || maybe === ']') return;

    try {
      const obj = JSON.parse(maybe);
      const norm = normalizeRecord(obj);
      if (!norm) {
        skipped++;
        return;
      }
      const key = dedupeKey(norm);
      map.set(key, norm);
      kept++;
    } catch {
      // Incomplete or junk line — skip it
      skipped++;
    }
  });

  await once(rl, 'close');

  const records = Array.from(map.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );

  // Write as a JSON array with one object per line, commas between, wrapped in []
  const fd = fs.openSync(outPath, 'w');
  try {
    fs.writeSync(fd, '[\n');
    records.forEach((r, i) => {
      const line = JSON.stringify(r);
      const comma = i === records.length - 1 ? '' : ',';
      fs.writeSync(fd, line + comma + '\n');
    });
    fs.writeSync(fd, ']\n');
  } finally {
    fs.closeSync(fd);
  }

  console.log(
    `Done. Read lines: ${lineNum}, Parsed: ${kept + skipped}, Kept valid: ${kept}, Unique after dedupe: ${records.length}, Skipped: ${skipped}`
  );
  console.log(`Wrote: ${outPath}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

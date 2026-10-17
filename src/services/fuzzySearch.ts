// Intelligent client-side fuzzy match and auto-correction engine for anime titles

const INITIAL_POPULAR_TITLES = [
  'Seihantai na Kimi to Boku',
  'Seihantai na Kimi to Boku 2nd Season',
  'Kimi ga Shinu made Koi wo Shitai',
  'BLEACH: Sennen Kessen-hen',
  'BLEACH',
  'Oshi no Ko',
  'Frieren: Beyond Journey’s End',
  'Sousou no Frieren',
  'Jujutsu Kaisen',
  'Demon Slayer: Kimetsu no Yaiba',
  'Kimetsu no Yaiba',
  'Chainsaw Man',
  'Attack on Titan',
  'Shingeki no Kyojin',
  'Solo Leveling',
  'Dandadan',
  'Kaiju No. 8',
  'Delicious in Dungeon',
  'Dungeon Meshi',
  'Spy x Family',
  'One Piece',
  'Naruto',
  'Death Note',
  'Steins;Gate',
  'Fullmetal Alchemist',
  'Hunter x Hunter',
  'Vinland Saga',
  'Haikyuu!!',
  'Sword Art Online',
  'Tokyo Ghoul',
  'Bocchi the Rock!',
  'Re:Zero - Starting Life in Another World',
  'Blue Lock',
  'Mushoku Tensei: Isekai Ittara Honki Dasu',
  'Mob Psycho 100',
  'Cowboy Bebop',
  'Neon Genesis Evangelion',
  'Cyberpunk: Edgerunners',
  'The Apothecary Diaries',
  'Kusuriya no Hitorigoto',
  'My Hero Academia',
  'Boku no Hero Academia',
  'Dr. STONE',
  'Overlord',
  'Black Clover',
  'Classroom of the Elite',
  'Kaguya-sama: Love Is War',
  'Violet Evergarden',
  'Vinland Saga Season 2',
  'Hell’s Paradise',
  'Jigokuraku'
];

// Active in-memory corpus with bounded size to prevent memory leaks
const MAX_CORPUS_SIZE = 500;
const corpusSet = new Set<string>(INITIAL_POPULAR_TITLES);

export function addTitlesToCorpus(titles: string[]): void {
  for (const t of titles) {
    if (t && t.trim()) {
      const trimmed = t.trim();
      if (!corpusSet.has(trimmed) && corpusSet.size >= MAX_CORPUS_SIZE) {
        const first = corpusSet.values().next().value;
        if (first) corpusSet.delete(first);
      }
      corpusSet.add(trimmed);
    }
  }
}

// Reusable Int32Array buffers for zero-allocation Levenshtein distance
let rowBufferA = new Int32Array(64);
let rowBufferB = new Int32Array(64);

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const requiredLen = n + 1;
  if (rowBufferA.length < requiredLen) {
    const newCap = Math.max(requiredLen, rowBufferA.length * 2);
    rowBufferA = new Int32Array(newCap);
    rowBufferB = new Int32Array(newCap);
  }

  let prevRow = rowBufferA;
  let currRow = rowBufferB;

  for (let j = 0; j <= n; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    const aChar = a.charCodeAt(i - 1);

    for (let j = 1; j <= n; j++) {
      const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
      const insertion = currRow[j - 1] + 1;
      const deletion = prevRow[j] + 1;
      const substitution = prevRow[j - 1] + cost;

      let min = insertion < deletion ? insertion : deletion;
      if (substitution < min) min = substitution;
      currRow[j] = min;
    }

    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  return prevRow[n];
}

function cleanWord(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Finds the best correction or prefix expansion for a search term
 */
export function findFuzzyCorrection(query: string): string | null {
  const qClean = cleanWord(query);
  if (qClean.length < 3) return null;

  let bestTerm: string | null = null;
  let bestDist = Infinity;

  for (const title of corpusSet) {
    // Check individual words in title
    const rawWords = title.split(/[\s:,-]+/);
    for (const raw of rawWords) {
      const wClean = cleanWord(raw);
      if (wClean.length < 3) continue;

      // Exact match - query is already an exact token
      if (wClean === qClean) return null;

      // 1. Prefix match: e.g. "seihant" matches "Seihantai"
      if (wClean.startsWith(qClean) && wClean.length > qClean.length) {
        return raw.replace(/[^a-zA-Z0-9]/g, '');
      }

      // 2. Fuzzy match: e.g. "sehantai" matches "Seihantai" (dist 1)
      const dist = levenshtein(qClean, wClean);
      const maxLen = Math.max(qClean.length, wClean.length);
      const allowedDist = maxLen <= 5 ? 1 : 2;

      if (dist <= allowedDist && dist < bestDist) {
        bestDist = dist;
        bestTerm = raw.replace(/[^a-zA-Z0-9]/g, '');
      }
    }

    // 3. Whole title check (for short titles like "Bleach", "Naruto", "Dandadan")
    const titleClean = cleanWord(title);
    if (titleClean.length >= 4 && qClean.length >= 4) {
      const dist = levenshtein(qClean, titleClean);
      if (dist <= 2 && dist < bestDist) {
        bestDist = dist;
        bestTerm = title.replace(/[^a-zA-Z0-9\s]/g, '').trim();
      }
    }
  }

  return bestTerm;
}

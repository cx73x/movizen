import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

type Category = 'popular' | 'top_rated' | 'now_playing';

type TmdbMovie = {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
};

type TmdbListResponse = {
  page: number;
  total_pages: number;
  results: TmdbMovie[];
};

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const CATEGORIES: Category[] = ['popular', 'top_rated', 'now_playing'];

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const tmdbApiKey = process.env.TMDB_API_KEY;

if (!supabaseUrl || !supabaseKey || !tmdbApiKey) {
  throw new Error('SUPABASE_URL, SUPABASE_KEY, and TMDB_API_KEY must be set in .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const pagesPerCategory = Number(process.env.SYNC_PAGES_PER_CATEGORY ?? 30);
const intervalMinutes = Number(process.env.SYNC_INTERVAL_MINUTES ?? 30);
const pageDelayMs = Number(process.env.SYNC_PAGE_DELAY_MS ?? 120);
const onceMode = process.argv.includes('--once');

let shutdownRequested = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeMovie(movie: TmdbMovie) {
  return {
    id: movie.id,
    title: movie.title,
    overview: movie.overview,
    release_date: movie.release_date || null,
    poster_path: movie.poster_path,
    backdrop_path: movie.backdrop_path,
    vote_average: movie.vote_average
  };
}

async function fetchCategoryPage(category: Category, page: number): Promise<TmdbListResponse> {
  const response = await axios.get<TmdbListResponse>(`${TMDB_BASE_URL}/movie/${category}`, {
    params: {
      api_key: tmdbApiKey,
      language: 'en-US',
      page
    },
    timeout: 30000
  });

  return response.data;
}

async function upsertMovies(rows: ReturnType<typeof normalizeMovie>[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase.from('movies').upsert(rows, { onConflict: 'id' });
  if (error) {
    throw error;
  }
}

async function runSyncCycle(): Promise<void> {
  const startedAt = new Date();
  console.log(`[sync] cycle start: ${startedAt.toISOString()}`);

  const seenIds = new Set<number>();
  let scanned = 0;
  let upserted = 0;

  for (const category of CATEGORIES) {
    if (shutdownRequested) {
      break;
    }

    let maxPages = pagesPerCategory;

    for (let page = 1; page <= maxPages; page += 1) {
      if (shutdownRequested) {
        break;
      }

      try {
        const payload = await fetchCategoryPage(category, page);
        const totalPagesFromApi = Number.isFinite(payload.total_pages) ? payload.total_pages : 1;
        maxPages = Math.min(maxPages, totalPagesFromApi);

        const results = Array.isArray(payload.results) ? payload.results : [];
        scanned += results.length;

        const uniqueRows: ReturnType<typeof normalizeMovie>[] = [];

        for (const movie of results) {
          if (seenIds.has(movie.id)) {
            continue;
          }
          seenIds.add(movie.id);
          uniqueRows.push(normalizeMovie(movie));
        }

        await upsertMovies(uniqueRows);
        upserted += uniqueRows.length;

        console.log(`[sync] ${category} page ${page}/${maxPages} scanned=${results.length} upserted=${uniqueRows.length}`);
      } catch (error) {
        console.error(`[sync] failed category=${category} page=${page}`, error);
      }

      if (pageDelayMs > 0) {
        await sleep(pageDelayMs);
      }
    }
  }

  const endedAt = new Date();
  const durationSec = ((endedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1);

  console.log(
    `[sync] cycle complete: scanned=${scanned} unique_upserted=${upserted} duration=${durationSec}s at ${endedAt.toISOString()}`
  );
}

async function startWorker(): Promise<void> {
  console.log(
    `[sync] worker boot: categories=${CATEGORIES.join(',')} pagesPerCategory=${pagesPerCategory} intervalMinutes=${intervalMinutes} once=${onceMode}`
  );

  while (!shutdownRequested) {
    await runSyncCycle();

    if (onceMode || shutdownRequested) {
      break;
    }

    const waitMs = Math.max(1, intervalMinutes) * 60 * 1000;
    console.log(`[sync] sleeping ${(waitMs / 1000).toFixed(0)}s before next cycle`);

    const step = 1000;
    let elapsed = 0;

    while (!shutdownRequested && elapsed < waitMs) {
      await sleep(step);
      elapsed += step;
    }
  }

  console.log('[sync] worker stopped');
}

process.on('SIGINT', () => {
  shutdownRequested = true;
  console.log('[sync] SIGINT received, stopping after current operation...');
});

process.on('SIGTERM', () => {
  shutdownRequested = true;
  console.log('[sync] SIGTERM received, stopping after current operation...');
});

void startWorker().catch((error) => {
  console.error('[sync] worker crashed', error);
  process.exit(1);
});

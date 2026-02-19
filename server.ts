import express, { Request, Response } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 5000);

app.use(cors());
app.use(express.json());

// Keys Check
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Keys missing! Check .env file.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- 🛠️ MAPPERS FOR ANDROID APP ---

// 1. Android ke 'LightMovie' ke liye
function mapToLightMovie(dbMovie: any) {
    return {
        id: dbMovie.id,
        title: dbMovie.title,
        poster_path: dbMovie.poster_path, // Already Full URL hai DB mein
        backdrop_path: dbMovie.backdrop_path,
        rating: dbMovie.rating || 0,
        release_date: dbMovie.release_date || null
    };
}

// 2. Android ke 'MovieDetails' ke liye
function mapToMovieDetails(dbMovie: any) {
    return {
        id: dbMovie.id,
        title: dbMovie.title,
        overview: dbMovie.overview || 'Story not available.',
        streamingLinks: dbMovie.stream_url ? [dbMovie.stream_url] : [], 
        downloadLinks: dbMovie.download_url ? [dbMovie.download_url] : [],
        runtime: dbMovie.runtime || null,
        genres: dbMovie.genres || [] 
    };
}

// --- 🌐 API ROUTES (Directly Connected to Supabase) ---

app.get('/', (req, res) => {
  res.json({ status: 'Online', message: 'MoviZen Backend (App-First) is running' });
});

// 🔥 1. TRENDING MOVIES
app.get('/api/movies/trending', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
        .from('movies')
        .select('*')
        .eq('category', 'trending')
        .limit(10);
    
    if (error) throw error;
    res.json((data || []).map(mapToLightMovie)); 
  } catch (error) {
    res.status(500).json([]);
  }
});

// 🔥 2. POPULAR MOVIES
app.get('/api/movies/popular', async (req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
          .from('movies')
          .select('*')
          .eq('category', 'popular')
          .limit(15);
      
      if (error) throw error;
      res.json((data || []).map(mapToLightMovie)); 
    } catch (error) {
      res.status(500).json([]);
    }
});

// 🔥 3. TOP RATED MOVIES
app.get('/api/movies/top-rated', async (req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
          .from('movies')
          .select('*')
          .eq('category', 'top_rated')
          .limit(15);
      
      if (error) throw error;
      res.json((data || []).map(mapToLightMovie)); 
    } catch (error) {
      res.status(500).json([]);
    }
});

// 🔍 4. SEARCH MOVIES (Title match)
app.get('/api/movies/search', async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query) return res.json([]); 

  try {
    const { data, error } = await supabase
        .from('movies')
        .select('*')
        .ilike('title', `%${query}%`) // Case-insensitive DB search
        .limit(20);
    
    if (error) throw error;
    res.json((data || []).map(mapToLightMovie));
  } catch (error) {
    res.status(500).json([]);
  }
});

// 🎬 5. MOVIE DETAILS (Heavy Data)
app.get('/api/movies/:id', async (req: Request, res: Response) => {
    const movieId = req.params.id;
    try {
        const { data, error } = await supabase
            .from('movies')
            .select('*')
            .eq('id', movieId)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: "Movie not found" });
        }

        res.json(mapToMovieDetails(data));
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 App-First API Running on port ${port}`);
});

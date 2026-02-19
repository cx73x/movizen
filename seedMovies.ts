import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Keys
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;
const tmdbApiKey = process.env.TMDB_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

function getFullUrl(path: string | null) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${IMAGE_BASE_URL}${path}`;
}

async function fetchMovieDetails(id: number) {
    try {
        const res = await axios.get(`${TMDB_BASE_URL}/movie/${id}?api_key=${tmdbApiKey}`);
        return res.data;
    } catch (e) {
        return null;
    }
}

async function seedCategory(endpoint: string, category: string) {
    console.log(`\n⏳ Fetching [${category}] movies from TMDB...`);
    
    try {
        const { data } = await axios.get(`${TMDB_BASE_URL}${endpoint}?api_key=${tmdbApiKey}`);
        const movies = data.results.slice(0, 15); // Har category ki top 15 movies lenge
        
        const payload = [];

        for (const movie of movies) {
            console.log(`   -> Processing: ${movie.title}`);
            // Har movie ki detail laayenge taaki runtime aur genre mil sake
            const details = await fetchMovieDetails(movie.id);

            payload.push({
                id: movie.id,
                title: movie.title,
                overview: movie.overview || 'Story not available',
                poster_path: getFullUrl(movie.poster_path), // Pura URL ban gaya
                backdrop_path: getFullUrl(movie.backdrop_path),
                rating: movie.vote_average || 0,
                release_date: movie.release_date || null,
                runtime: details?.runtime || null,
                genres: details?.genres?.map((g: any) => g.name) || [], // ["Action", "Sci-Fi"]
                category: category,
                // Demo video/download links taaki app mein test kar sako
                stream_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
                download_url: "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4"
            });
        }

        console.log(`💾 Saving ${payload.length} [${category}] movies to Supabase...`);
        const { error } = await supabase.from('movies').upsert(payload, { onConflict: 'id' });
        
        if (error) {
            console.error(`❌ DB Error for ${category}:`, error.message);
        } else {
            console.log(`✅ Success for ${category}!`);
        }

    } catch (error: any) {
        console.error(`❌ Failed to seed ${category}:`, error.message);
    }
}

async function runSeeder() {
    console.log("🚀 Starting Database Seeder...");
    await seedCategory('/trending/movie/week', 'trending');
    await seedCategory('/movie/popular', 'popular');
    await seedCategory('/movie/top_rated', 'top_rated');
    console.log("\n🎉 Database Seeding Complete! You can now run the server.");
}

runSeeder();

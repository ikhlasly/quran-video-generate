import type { Surah, AyahEdition, Reciter } from '@/types/quran';

const BASE_URL = 'https://api.alquran.cloud/v1';

export interface TranslationEdition {
  identifier: string;
  language: string;
  name: string;
  englishName: string;
  format: string;
  type: string;
  direction: string | null;
}

// Comprehensive language name map
export const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic',
  en: 'English',
  fr: 'French',
  de: 'German',
  tr: 'Turkish',
  ur: 'Urdu',
  id: 'Indonesian',
  ms: 'Malay',
  es: 'Spanish',
  zh: 'Chinese',
  ru: 'Russian',
  fa: 'Persian',
  hi: 'Hindi',
  bn: 'Bengali',
  pt: 'Portuguese',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  th: 'Thai',
  vi: 'Vietnamese',
  pl: 'Polish',
  nl: 'Dutch',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  cs: 'Czech',
  ro: 'Romanian',
  hu: 'Hungarian',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sr: 'Serbian',
  bs: 'Bosnian',
  az: 'Azerbaijani',
  kk: 'Kazakh',
  uz: 'Uzbek',
  ku: 'Kurdish',
  ps: 'Pashto',
  ml: 'Malayalam',
  ta: 'Tamil',
  te: 'Telugu',
  my: 'Burmese',
  sw: 'Swahili',
  tl: 'Filipino',
  am: 'Amharic',
  ha: 'Hausa',
  sd: 'Sindhi',
  si: 'Sinhala',
  so: 'Somali',
  sq: 'Albanian',
  tg: 'Tajik',
  sk: 'Slovak',
  sl: 'Slovenian',
  mk: 'Macedonian',
  as: 'Assamese',
  kn: 'Kannada',
  yo: 'Yoruba',
  jv: 'Javanese',
  su: 'Sundanese',
  ba: 'Bashkir',
  ber: 'Berber',
  ce: 'Chechen',
  dv: 'Dhivehi',
  tt: 'Tatar',
  ug: 'Uyghur',
};

export function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] || code.toUpperCase();
}

// Cache
let surahsCache: Surah[] | null = null;
let surahsCacheTime = 0;
const SURAHS_CACHE_TTL = 86400; // 24 hours

// Fallback reciters
const FALLBACK_RECITERS: Reciter[] = [
  { identifier: 'ar.alafasy', language: 'ar', name: 'مشاري العفاسي', englishName: 'Mishary Rashid Alafasy', format: 'audio', type: 'versebyverse', direction: null },
  { identifier: 'ar.abdurrahmaansudais', language: 'ar', name: 'عبد الرحمن السديس', englishName: 'Abdurrahmaan As-Sudais', format: 'audio', type: 'versebyverse', direction: null },
  { identifier: 'ar.abdulbasitmurattal', language: 'ar', name: 'عبد الباسط عبد الصمد', englishName: 'Abdul Basit (Murattal)', format: 'audio', type: 'versebyverse', direction: null },
  { identifier: 'ar.husary', language: 'ar', name: 'محمود خليل الحصري', englishName: 'Mahmoud Khalil Al-Husary', format: 'audio', type: 'versebyverse', direction: null },
  { identifier: 'ar.minshawi', language: 'ar', name: 'محمد صديق المنشاوي', englishName: 'Mohamed Siddiq Al-Minshawi', format: 'audio', type: 'versebyverse', direction: null },
  { identifier: 'ar.ahmedajamy', language: 'ar', name: 'أحمد العجمي', englishName: 'Ahmed Ibn Ali Al-Ajamy', format: 'audio', type: 'versebyverse', direction: null },
];

// Fallback translations
const FALLBACK_TRANSLATIONS: TranslationEdition[] = [
  { identifier: 'en.sahih', language: 'en', name: 'Saheeh International', englishName: 'Saheeh International', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'en.pickthall', language: 'en', name: 'M. M. Pickthall', englishName: 'M. M. Pickthall', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'en.yusufali', language: 'en', name: 'Abdullah Yusuf Ali', englishName: 'Abdullah Yusuf Ali', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'en.shakir', language: 'en', name: 'M. H. Shakir', englishName: 'M. H. Shakir', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'en.daryabadi', language: 'en', name: 'Abdul Majid Daryabadi', englishName: 'Abdul Majid Daryabadi', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'en.asad', language: 'en', name: 'Muhammad Asad', englishName: 'Muhammad Asad', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'fr.hamidullah', language: 'fr', name: 'Muhammad Hamidullah', englishName: 'Muhammad Hamidullah', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'de.bubenheim', language: 'de', name: 'Frank Bubenheim and Nadeem Elyas', englishName: 'Frank Bubenheim and Nadeem Elyas', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'tr.diyanet', language: 'tr', name: 'Diyanet İşleri', englishName: 'Diyanet Isleri', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'ur.jalandhry', language: 'ur', name: 'Tafsir Jalalayn - Urdu', englishName: 'Tafsir Jalalayn - Urdu', format: 'text', type: 'translation', direction: 'rtl' },
  { identifier: 'id.indonesian', language: 'id', name: 'Bahasa Indonesia', englishName: 'Bahasa Indonesia', format: 'text', type: 'translation', direction: 'ltr' },
  { identifier: 'ms.basmeih', language: 'ms', name: 'Abdullah Basmeih', englishName: 'Abdullah Basmeih', format: 'text', type: 'translation', direction: 'ltr' },
];

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function getSurahs(): Promise<Surah[]> {
  const now = Date.now() / 1000;
  if (surahsCache && (now - surahsCacheTime) < SURAHS_CACHE_TTL) {
    return surahsCache;
  }

  try {
    const res = await fetchWithTimeout(`${BASE_URL}/surah`);
    const data = await res.json();
    if (data.code === 200 && data.data) {
      surahsCache = data.data as Surah[];
      surahsCacheTime = Date.now() / 1000;
      return surahsCache;
    }
    throw new Error('Invalid response');
  } catch {
    // Return a minimal fallback
    if (surahsCache) return surahsCache;
    return [];
  }
}

export async function getReciters(): Promise<Reciter[]> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/edition?format=audio&type=versebyverse`);
    const data = await res.json();
    if (data.code === 200 && data.data) {
      const all = data.data as Reciter[];
      // Filter Arabic only
      const arabic = all.filter(r => r.language === 'ar');
      // Sort by englishName
      arabic.sort((a, b) => a.englishName.localeCompare(b.englishName));
      return arabic;
    }
    throw new Error('Invalid response');
  } catch {
    return FALLBACK_RECITERS.sort((a, b) => a.englishName.localeCompare(b.englishName));
  }
}

export async function getTranslations(): Promise<TranslationEdition[]> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/edition?type=translation`);
    const data = await res.json();
    if (data.code === 200 && data.data) {
      const all = data.data as TranslationEdition[];
      // Exclude Arabic translations (they are not translations of Arabic)
      const filtered = all.filter(t => t.language !== 'ar');
      // Sort: English first, then by language name, then by englishName
      filtered.sort((a, b) => {
        if (a.language === 'en' && b.language !== 'en') return -1;
        if (a.language !== 'en' && b.language === 'en') return 1;
        const langA = getLanguageName(a.language);
        const langB = getLanguageName(b.language);
        const langComp = langA.localeCompare(langB);
        if (langComp !== 0) return langComp;
        return a.englishName.localeCompare(b.englishName);
      });
      return filtered;
    }
    throw new Error('Invalid response');
  } catch {
    return FALLBACK_TRANSLATIONS.sort((a, b) => {
      if (a.language === 'en' && b.language !== 'en') return -1;
      if (a.language !== 'en' && b.language === 'en') return 1;
      return a.englishName.localeCompare(b.englishName);
    });
  }
}

export async function getAyahs(
  surah: number,
  startAyah: number,
  endAyah: number,
  reciter: string,
  translation: string
): Promise<{ arabic: AyahEdition; translated: AyahEdition }> {
  const [arabicRes, translatedRes] = await Promise.all([
    fetchWithTimeout(`${BASE_URL}/surah/${surah}/${reciter}`),
    fetchWithTimeout(`${BASE_URL}/surah/${surah}/${translation}`),
  ]);

  const arabicData = await arabicRes.json();
  const translatedData = await translatedRes.json();

  if (arabicData.code !== 200 || translatedData.code !== 200) {
    throw new Error('Failed to fetch ayah data');
  }

  const arabicEdition = arabicData.data as AyahEdition;
  const translatedEdition = translatedData.data as AyahEdition;

  // Filter to requested ayah range
  arabicEdition.ayahs = arabicEdition.ayahs.filter(
    a => a.numberInSurah >= startAyah && a.numberInSurah <= endAyah
  );
  translatedEdition.ayahs = translatedEdition.ayahs.filter(
    a => a.numberInSurah >= startAyah && a.numberInSurah <= endAyah
  );

  return { arabic: arabicEdition, translated: translatedEdition };
}

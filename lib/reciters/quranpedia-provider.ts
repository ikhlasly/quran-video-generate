import type { UnifiedReciter, ReciterMoshaf } from '@/types/quran';
import type { ReciterProvider } from './provider';
import {
  fetchJsonWithRetry,
  normalizeServerUrl,
  pad3,
} from './provider';

const QURANPEDIA_BASE = 'https://api.quranpedia.net/v1';

/**
 * Raw shape of a single moshaf (recitation style / audio server) as returned
 * by QuranPedia `/v1/reciters`.
 *
 * The endpoint returns `Array<Array<MoshafRaw>>` — the outer array is grouped
 * by reciter, each inner array is that reciter's available moshaf entries.
 * There is no dedicated reciter object; the reciter's Arabic name is embedded
 * in every moshaf's `name` field as "مصحف {reciter} برواية {riwayah}".
 */
interface MoshafRaw {
  id: number;
  name: string; // e.g. "مصحف إبراهيم الأخضر برواية حفص عن عاصم"
  surahs_list?: number[];
  timing_url?: string | null;
  server: string;
  rawi?: { id: number; name: string };
  recitation_type?: { id: number; ar_name: string };
  classification?: { id: number; name: string };
}

/** QuranPedia's `/v1/reciters` response is a bare JSON array of reciter groups
 * (`MoshafRaw[][]`). We type the fetch as `unknown` and coerce defensively in
 * `extractGroups()` to tolerate future wrapper-object variants. */

/** Map QuranPedia's Arabic recitation-type names to English labels. */
const RECITATION_TYPE_MAP: Record<string, string> = {
  مرتل: 'Murattal',
  مجود: 'Mujawwad',
  معلم: "Mu'allim",
};

/**
 * Curated map of mp3quran.net gapless-server slug → proper English reciter
 * name. These slugs are short abbreviations (e.g. `afs`, `husr`, `minsh`) that
 * cannot be turned into readable names by simple slug-to-title-case conversion,
 * so we map them explicitly. Built by cross-referencing each slug with its
 * Arabic reciter name from the QuranPedia API.
 *
 * Reciters with verse-by-verse servers (full-name slugs like
 * `ibrahim_alakhdar`) are handled by `slugToName()` and do not need entries
 * here. This map only covers gapless-only reciters whose slugs are cryptic.
 */
const KNOWN_SLUG_NAMES: Record<string, string> = {
  // Well-known abbreviations
  afs: 'Mishary Alafasy',
  ajm: 'Ahmed Al Ajamy',
  akdr: 'Ibrahim Al Akhdar',
  husr: 'Mahmoud Khalil Al Husary',
  minsh: 'Mohamed Siddiq Al Minshawi',
  basit: 'Abdul Basit Abdul Samad',
  shatri: 'Abu Bakr Al Shatri',
  saad: 'Saad Al Ghamdi',
  maher: 'Maher Al Muaiqly',
  sayed: 'Sayed Ramadan',
  abkr: 'Idrees Abkar',
  ayyub: 'Mohammed Ayyoub',
  jbrl: 'Mohammed Jibreel',
  jhn: 'Abdullah Al Juhany',
  sds: 'Abdul Rahman Al Sudais',
  shur: 'Saud Al Shuraim',
  qtm: 'Nasser Al Qatami',
  qht: 'Khalid Al Qahtani',
  hafz: 'Imad Zuhair Hafiz',
  hajjaj: 'Ali Hajjaj Al Sawisi',
  huth: 'Ahmed Al Hudhaifi',
  hthfi: 'Ali Al Hudhaifi',
  huthifi_qalon: 'Ali Al Hudhaifi',
  bukhari: 'Abdullah Al Bukhari',
  // Readable gapless slugs → proper names
  ahmad_huth: 'Ahmed Al Hudhaifi',
  ahmad_nu: 'Ahmed Neana',
  ibrahim_dosri: 'Ibrahim Al Dosri',
  ibrahim_dosri_hafs: 'Ibrahim Al Dosri',
  IbrahemSadan: 'Ibrahim Al Sadan',
  'Ibrahim-Al-Shahri': 'Ibrahim Al Shahri',
  trabulsi: 'Ahmed Al Trabulsi',
  trablsi: 'Ahmed Khader Al Trabulsi',
  nufais: 'Ahmed Al Nufais',
  hawashi: 'Ahmed Al Hawashi',
  swlim: 'Ahmed Al Suwailim',
  saud: 'Ahmed Saud',
  saber: 'Ahmed Saber',
  Aamer: 'Ahmed Amer',
  jbreen: 'Ibrahim Al Jibreen',
  '3siri': 'Ibrahim Al Asiri',
  '3zazi': 'Al Husseini Al Azazi',
  dokali: 'Al Dokali Mohammed Al Alam',
  alzain: 'Al Zain Mohammed Ahmed',
  omran: 'Al Ashri Omran',
  fateh: 'Al Fateh Mohammed Al Zubair',
  bader: 'Badr Al Turki',
  balilah: 'Bandar Balilah',
  twfeeq: 'Tawfiq Al Sayegh',
  jamal: 'Jamal Shaker Abdullah',
  jaman: 'Jamaan Al Otaibi',
  hatem: 'Hatem Farid Al Wair',
  alshaik: 'Hussein Al Al Sheikh',
  hamad: 'Hamad Al Daghiri',
  jleel: 'Khalid Al Jalil',
  sharekh: 'Khalid Al Sharekh',
  shoraimy: 'Khalid Al Shuraim',
  ghamdi: 'Khalid Al Ghamdi',
  mohna: 'Khalid Al Mohanna',
  whabi: 'Khalid Al Wuhaibi',
  kafi: 'Khalid Abdul Karim',
  hamza: 'Dawood Hamza',
  rami: 'Rami Al Duais',
  rashad: 'Mohammed Rashad Al Sharif',
  refat: 'Mohammed Refaat',
  ryan: 'Adel Ryan',
  salamah: 'Yasser Salamah',
  salman: 'Salman Al Otaibi',
  sami_dosr: 'Sami Al Dosri',
  sami_hsn: 'Sami Al Hasan',
  shaheen: 'Ahmed Khalil Shaheen',
  shamrani: 'Saleh Al Shamrani',
  shamsan: 'Al Walid Al Shamsan',
  sheimy: 'Mahmoud Al Sheimi',
  sneineh: 'Mohammed Abu Sneineh',
  soufi: 'Abdul Rashid Soufi',
  souilass: 'Younes Asouilass',
  taher: 'Shirzad Abdul Rahman Taher',
  tareq: 'Tariq Abdul Ghani Daoub',
  tblawi: 'Mohammed Al Tablawi',
  thubti: 'Abdul Bari Al Thubaiti',
  tnjy: 'Khalifa Al Taniji',
  waleed: 'Walid Al Naihi',
  wasel: 'Wasel Al Muthann',
  wdee3: 'Wadee Al Yamani',
  wdod: 'Abdul Wadud Hanif',
  yahya: 'Yahya Hawwa',
  yasser: 'Yasser Al Dosari',
  yousef: 'Yousef Al Shoaee',
  zahrani: 'Abdul Aziz Al Zahrani',
  zakariya: 'Zakariya Hamameh',
  zaki: 'Zaki Daghestani',
  zaml: 'Majid Al Zamil',
  zilaie: 'Jamal Al Din Al Zailaie',
  // a_ prefixed (Abdul...)
  a_abdl: 'Abdullah Abdal',
  a_ahmed: 'Abdul Aziz Al Ahmed',
  a_alaskar: 'Abdul Malik Al Askar',
  a_alemadi: 'Anas Al Emadi',
  a_alhazmi: 'Abdul Karim Al Hazmi',
  a_alqrafi: 'Abdullah Al Qarafi',
  a_alshahhat: 'Abdul Rahman Al Shahhat',
  a_binaoun: 'Abdul Ilah Bin Awn',
  a_binhameed: 'Ahmed Talib Bin Hamid',
  a_bukhari: 'Abdullah Al Bukhari',
  a_jbr: 'Ali Jaber',
  a_klb: 'Adel Al Kalbani',
  a_majed: 'Abdul Rahman Al Majed',
  a_sheim: 'Abdul Aziz Suhaim',
  a_swaiyd: 'Abdul Rahman Al Swayyd',
  a_turki: 'Abdul Aziz Al Turki',
  // Others
  'A-AlBadr': 'Abdul Rahman Al Badr',
  'a-almishal': 'Abdullah Al Mishal',
  'A-Ghailan': 'Abdul Badi Ghailan',
  abdulazizasiri: 'Abdul Aziz Al Asiri',
  abdullah: 'Mohammed Abdul Hakim Al Abdullah',
  Abdullahk: 'Abdullah Al Kindari',
  abo_hashim: 'Ali Abu Hashim',
  aloosi: 'Abdul Rahman Al Aloosi',
  alosfor: 'Nasser Al Asfour',
  arkani: 'Abdul Wali Al Arkani',
  askr: 'Abdul Mohsin Al Askar',
  bari: 'Abdul Bari Mohammed',
  bilal: 'Musa Bilal',
  bl3: 'Rashid Belaliah',
  bna: 'Mahmoud Ali Al Banna',
  braak: 'Mohammed Al Barrak',
  brmi: 'Abdullah Al Braimi',
  bsfr: 'Abdullah Basfar',
  bu_khtr: 'Salah Bu Khatir',
  buajan: 'Abdullah Al Buaigan',
  bukheet: 'Mohammed Al Bukheet',
  darweez: 'Omar Al Dareeweiz',
  deban: 'Ahmed Deban',
  dgsh: 'Youssef Al Dghoush',
  dlami: 'Walid Al Dulaimi',
  earawi: 'Mohammed Al Irawi',
  f_hajry: 'Faisal Al Hajri',
  f_khamery: 'Fouad Al Khamri',
  fahad_otibi: 'Fahad Al Otaibi',
  fawaz: 'Fawaz Al Kaabi',
  frs_a: 'Fares Abbad',
  fyl: 'Yasser Al Filkawi',
  gulan: 'Abdullah Ghailan',
  h_abudalal: 'Hashem Abu Dalal',
  h_baqai: 'Haroun Baqai',
  h_dukhain: 'Haitham Al Dukhain',
  h_saleh: 'Hassan Saleh',
  'H-Aldaghriri': 'Hassan Al Daghiri',
  'H-Lharraz': 'Hesham Al Harraz',
  habdan: 'Saleh Al Habdan',
  hazza: 'Hazza Al Balushi',
  hitham: 'Haitham Al Jadaani',
  hkm: 'Saber Abdul Hakim',
  i_kshidan: 'Ibrahim Kishidan',
  i_sanankoua: 'Issa Omar Sanako',
  ifrad: 'Rashid Ifrad',
  islam: 'Islam Sobhi',
  'J-Abdullah': 'Junaid Adam Abdullah',
  jormy: 'Ibrahim Al Jarmi',
  'K-Alzadi': 'Khalid Al Ziyadi',
  kamel: 'Abdullah Kamel',
  kanakeri: 'Abdul Hadi Kanakri',
  kh_mohammadi: 'Khalid Karim Mohammadi',
  khalf: 'Abdullah Al Khalf',
  khan: 'Mohammed Othman Khan',
  kndri: 'Fahd Al Kindari',
  koshi: 'Al Uyun Al Koshi',
  kurdi: 'Raad Mohammed Al Kurdi',
  kyat: 'Abdullah Khayyat',
  lafi: 'Lafi Al Awni',
  lahoni: 'Mostafa Al Lahoni',
  lhdan: 'Mohammed Al Luhaidan',
  m_abdelhakam: 'Mahmoud Abdul Hakam',
  m_akri: 'Marwan Al Akri',
  M_Alfaqih: 'Mohammed Al Faqih',
  m_arkani: 'Abdul Majeed Al Arkani',
  M_Burhaji: 'Mohammed Burhaji',
  m_krm: 'Mohammed Abdul Karim',
  m_qari: 'Mohammed Khalil Al Qari',
  m_sayed: 'Mohammed Sayed',
  majd_onazi: 'Majid Al Anazi',
  'mal-allah_jaber': 'Mal Allah Abdul Rahman Al Jaber',
  malaysia: 'Akhil Abdul Hai',
  mansor: 'Mansour Al Salimi',
  mhsny: 'Mohammed Al Muhsini',
  mohsin_harthi: 'Abdul Mohsin Al Harthi',
  monshed: 'Mohammed Al Munshid',
  mousa: 'Abdullah Al Mousa',
  mrifai: 'Mahmoud Al Rifaai',
  mtrod: 'Abdullah Al Matroud',
  muamr: 'Muammar Al Indonesian',
  muftah_sultany: 'Muftah Al Sultani',
  mukhtar_haj: 'Mukhtar Al Haj',
  musali: 'Salah Musalli',
  mustafa: 'Mustafa Ismail',
  mzroyee: 'Yasser Al Mazrouei',
  nabil: 'Nabil Al Rifaai',
  namh: 'Nimat Al Hassan',
  nasser_almajed: 'Nasser Al Majed',
  nathier: 'Nadhir Al Maliki',
  noah: 'Youssef Bin Noah Ahmed',
  nourin_siddig: 'Noureen Mohammed Siddig',
  obaid: 'Nasser Al Obaid',
  obk: 'Abdul Mohsin Al Abikan',
  okasha: 'Okasha Kamini',
  omar_warsh: 'Omar Al Qazabri',
  Othmn: 'Othman Al Ansari',
  peshawa: 'Peshawa Qadir Al Kurdi',
  qari: 'Yassin',
  qasm: 'Abdul Mohsin Al Qasim',
  qeniwa: 'Mohammed Al Amin Qeniwa',
  qurashi: 'Yasser Al Qurashi',
  ra3ad: 'Mustafa Raad Al Azawi',
  s_alquraishi: 'Saleh Al Quraishi',
  s_bud: 'Salah Al Budeir',
  s_gmd: 'Saad Al Ghamdi',
  s_hashemi: 'Sayyed Ahmed Hashemi',
  s_sadeiq: 'Salman Al Siddiq',
  sahood: 'Saleh Al Sahood',
  salah_hashim_m: 'Salah Al Hashim',
  shaban: 'Shaban Al Sayyad',
  shah: 'Mohammed Saleh Alam Shah',
  shaibat: 'Malik Shaiba Al Hamad',
  shakoor: 'Ramadan Shakoor',
  shaksh: 'Maher Shakhashiro',
  shl: 'Sahl Yassin',
  Y_ALaidroos: 'Youssef Al Aidroos',
  recitations: 'Al Amin Qeniwa',
  wishear: 'Wishyar Haidar Arbili',
};

/**
 * QuranPedia provider.
 *
 * Fetches `https://api.quranpedia.net/v1/reciters`, which returns a nested
 * array `MoshafRaw[][]` (grouped by reciter). Each reciter is normalized into
 * a `UnifiedReciter` whose `moshaf` array carries one entry per audio server.
 *
 * Audio URL patterns (verified against the live CDN):
 *  - verse-by-verse (classification "حسب الآيات"): `{server}{surah3}{ayah3}.mp3`
 *  - gapless        (classification "حسب السور"): `{server}{surah3}.mp3`
 *
 * English name derivation priority:
 *  1. Verse-by-verse server slug (full-name slugs like `ibrahim_alakhdar`).
 *  2. Gapless server slug via the curated `KNOWN_SLUG_NAMES` map.
 *  3. Gapless server slug converted to title case (when readable).
 *  4. Arabic-to-Latin transliteration of the Arabic name (last resort).
 *
 * Failure handling: `fetchReciters()` never throws — on terminal failure it
 * returns `[]`, so the unified service can still return AlQuran reciters.
 */
export class QuranPediaProvider implements ReciterProvider {
  readonly name = 'quranpedia' as const;
  readonly label = 'QuranPedia';

  async fetchReciters(): Promise<UnifiedReciter[]> {
    try {
      const payload = await fetchJsonWithRetry<unknown>(
        `${QURANPEDIA_BASE}/reciters`,
        { timeoutMs: 15000, retries: 2, backoffMs: 700 },
      );

      // The endpoint returns a bare array of reciter groups. Be defensive and
      // also accept `{ data: [...] }` / `{ reciters: [...] }` wrappers.
      const groups = this.extractGroups(payload);
      if (!groups.length) return [];

      const unified: UnifiedReciter[] = [];
      groups.forEach((group, index) => {
        const u = this.normalizeGroup(group, index);
        if (u) unified.push(u);
      });

      unified.sort((a, b) =>
        (a.englishName || a.name).localeCompare(b.englishName || b.name),
      );
      return unified;
    } catch (err) {
      console.error('[QuranPediaProvider] fetchReciters failed:', err);
      return [];
    }
  }

  /**
   * Build per-ayah audio URLs for a QuranPedia reciter using its preferred
   * moshaf server. Verse-by-verse servers yield one URL per ayah. Gapless
   * servers only expose full-surah files — we surface the surah URL on the
   * first ayah and `null` for the rest; the pipeline handles missing audio
   * gracefully (estimated timing).
   */
  getAyahAudioUrls(
    reciter: UnifiedReciter,
    surah: number,
    startAyah: number,
    endAyah: number,
  ): (string | null)[] {
    const moshaf = reciter.preferredMoshaf ?? reciter.moshaf?.[0];
    if (!moshaf?.server) return [];

    const server = normalizeServerUrl(moshaf.server);
    const surahStr = pad3(surah);
    const urls: (string | null)[] = [];

    if (moshaf.moshafType === 'versebyverse') {
      for (let ayah = startAyah; ayah <= endAyah; ayah++) {
        urls.push(`${server}${surahStr}${pad3(ayah)}.mp3`);
      }
    } else if (moshaf.moshafType === 'gapless') {
      const fullSurahUrl = `${server}${surahStr}.mp3`;
      for (let ayah = startAyah; ayah <= endAyah; ayah++) {
        urls.push(ayah === startAyah ? fullSurahUrl : null);
      }
    } else {
      // Unknown layout — try verse-by-verse first (most useful for per-ayah
      // timing). The download step's try/catch handles 404s gracefully.
      for (let ayah = startAyah; ayah <= endAyah; ayah++) {
        urls.push(`${server}${surahStr}${pad3(ayah)}.mp3`);
      }
    }
    return urls;
  }

  // -----------------------------------------------------------------------
  // Normalization
  // -----------------------------------------------------------------------

  /** Coerce various possible response shapes into `MoshafRaw[][]`. */
  private extractGroups(payload: unknown): MoshafRaw[][] {
    if (!payload) return [];
    // Bare array of groups.
    if (Array.isArray(payload)) {
      if (payload.length && Array.isArray(payload[0])) {
        return payload as MoshafRaw[][];
      }
      // Some variants may flatten to a single moshaf list — wrap it.
      if (payload.length && typeof payload[0] === 'object') {
        return [payload as MoshafRaw[]];
      }
      return [];
    }
    // Wrapped: { data: [...] } or { reciters: [...] }
    if (typeof payload === 'object') {
      const obj = payload as { data?: unknown; reciters?: unknown };
      const inner = obj.data ?? obj.reciters;
      if (Array.isArray(inner)) {
        if (inner.length && Array.isArray(inner[0])) return inner as MoshafRaw[][];
        if (inner.length && typeof inner[0] === 'object') return [inner as MoshafRaw[]];
      }
    }
    return [];
  }

  /** Normalize one reciter group (inner array of moshaf objects). */
  private normalizeGroup(
    group: MoshafRaw[],
    groupIndex: number,
  ): UnifiedReciter | null {
    if (!Array.isArray(group) || group.length === 0) return null;

    const first = group[0];
    const arabicName = this.extractReciterName(first.name);
    if (!arabicName) return null;

    const moshafList = group
      .map((m) => this.normalizeMoshaf(m))
      .filter((m): m is ReciterMoshaf => !!m && !!m.server);

    // Prefer verse-by-verse moshaf for audio generation (per-ayah files).
    const preferredMoshaf =
      moshafList.find((m) => m.moshafType === 'versebyverse') ?? moshafList[0];

    const englishName = this.deriveEnglishName(group, arabicName);
    const style = first.recitation_type?.ar_name
      ? RECITATION_TYPE_MAP[first.recitation_type.ar_name] ??
        first.recitation_type.ar_name
      : undefined;

    const metadataParts: string[] = [];
    if (style) metadataParts.push(style);
    if (preferredMoshaf?.moshafType === 'versebyverse') {
      metadataParts.push('Verse-by-verse');
    } else if (preferredMoshaf?.moshafType === 'gapless') {
      metadataParts.push('Gapless');
    }
    if (preferredMoshaf?.bitrate) {
      metadataParts.push(`${preferredMoshaf.bitrate}kbps`);
    }

    return {
      id: `quranpedia:${groupIndex}`,
      source: 'quranpedia',
      providerId: String(groupIndex),
      identifier: null,
      name: arabicName,
      englishName,
      language: 'ar',
      style,
      moshaf: moshafList.length ? moshafList : undefined,
      preferredMoshaf,
      metadata: metadataParts.join(' · ') || undefined,
      raw: group,
    };
  }

  /**
   * Extract the reciter's Arabic name from a moshaf `name` like
   * "مصحف إبراهيم الأخضر برواية حفص عن عاصم" → "إبراهيم الأخضر".
   */
  private extractReciterName(moshafName: string): string {
    if (!moshafName) return '';
    let n = moshafName.trim();
    if (n.startsWith('مصحف ')) n = n.slice('مصحف '.length).trim();
    if (n.startsWith('القارئ ')) n = n.slice('القارئ '.length).trim();
    if (n.startsWith('المصحف المعلم للقارئ ')) n = n.slice('المصحف المعلم للقارئ '.length).trim();
    const cut = n.indexOf(' برواية');
    if (cut > 0) n = n.slice(0, cut).trim();
    return n;
  }

  /**
   * Derive a readable English name for a reciter group.
   *
   * Priority:
   *  1. Verse-by-verse server slug → `slugToName()` (full-name slugs).
   *  2. Gapless server slug → `KNOWN_SLUG_NAMES` curated map.
   *  3. Gapless server slug → `slugToName()` (when the slug is readable).
   *  4. Transliteration of the Arabic name (guarantees a Latin result).
   */
  private deriveEnglishName(group: MoshafRaw[], arabicName: string): string {
    // 1. Prefer verse-by-verse moshaf servers (full-name slugs).
    const verseMoshaf = group.find(
      (m) => m.classification?.name === 'حسب الآيات' && m.server,
    );
    if (verseMoshaf) {
      const candidate = this.slugToName(verseMoshaf.server);
      if (candidate && this.isReadableEnglishName(candidate)) {
        return candidate;
      }
    }

    // 2 & 3. Try gapless server slugs: curated map first, then slug conversion.
    for (const m of group) {
      if (m.classification?.name !== 'حسب السور' || !m.server) continue;
      const slug = this.extractSlug(m.server);
      if (!slug) continue;
      // Curated map — authoritative English name.
      if (KNOWN_SLUG_NAMES[slug]) {
        return KNOWN_SLUG_NAMES[slug];
      }
      // Slug conversion — only if the slug is readable (looks like a name).
      const candidate = this.slugToName(m.server);
      if (candidate && this.isReadableEnglishName(candidate)) {
        return candidate;
      }
    }

    // 4. Last resort: transliterate the Arabic name so we never show Arabic.
    const transliterated = this.transliterateArabic(arabicName);
    return transliterated || arabicName;
  }

  /** Extract the reciter-name slug from a server URL. */
  private extractSlug(server: string): string | null {
    try {
      const u = new URL(server);
      const segs = u.pathname.split('/').filter(Boolean);
      const slug = segs.find(
        (s) => s !== 'arabic' && !/^\d+$/.test(s) && /[a-z]/i.test(s),
      );
      return slug ?? null;
    } catch {
      return null;
    }
  }

  /** Convert a server URL slug into a title-cased display name. */
  private slugToName(server: string): string | null {
    const slug = this.extractSlug(server);
    if (!slug) return null;
    return slug
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  /**
   * A derived English name is "readable" if it contains at least one
   * alphabetic token of length >= 4 and no leading digit. This filters out
   * cryptic gapless-server abbreviations (e.g. "3siri", "Akdr", "A").
   */
  private isReadableEnglishName(name: string): boolean {
    if (!name) return false;
    if (/\d/.test(name)) return false;
    const tokens = name.split(/\s+/).filter(Boolean);
    return tokens.some((t) => /^[A-Za-z]{4,}$/.test(t));
  }

  /**
   * Simple Arabic-to-Latin transliteration for reciter names.
   *
   * Not a perfect transliteration (Arabic has complex vowel/sun-letter rules),
   * but produces readable Latin text so English-speaking users never see raw
   * Arabic. Handles the "ال" (Al) article prefix and strips tashkeel
   * (diacritics).
   */
  private transliterateArabic(arabic: string): string {
    if (!arabic) return '';
    // Strip Arabic diacritics (tashkeel).
    const stripped = arabic.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
    const map: Record<string, string> = {
      'أ': 'a', 'إ': 'i', 'آ': 'a', 'ا': 'a',
      'ب': 'b', 'ت': 't', 'ث': 'th',
      'ج': 'j', 'ح': 'h', 'خ': 'kh',
      'د': 'd', 'ذ': 'dh',
      'ر': 'r', 'ز': 'z',
      'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd',
      'ط': 't', 'ظ': 'z',
      'ع': 'a', 'غ': 'gh',
      'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l',
      'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y',
      'ى': 'a', 'ة': 'a', 'ء': '',
      'ئ': 'y', 'ؤ': 'w',
      ' ': ' ',
    };
    let result = '';
    for (const ch of stripped) {
      result += map[ch] ?? ch;
    }
    // Clean up double letters from digraphs in odd positions, collapse spaces.
    result = result.replace(/\s+/g, ' ').trim();
    // Title-case each word.
    result = result
      .split(' ')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
      .join(' ');
    return result;
  }

  private normalizeMoshaf(m: MoshafRaw): ReciterMoshaf | null {
    if (!m || !m.server) return null;
    const server = normalizeServerUrl(m.server);
    const classification = m.classification?.name;
    const moshafType: ReciterMoshaf['moshafType'] =
      classification === 'حسب الآيات'
        ? 'versebyverse'
        : classification === 'حسب السور'
          ? 'gapless'
          : 'unknown';

    // Bitrate may be encoded as a numeric path segment (e.g. "/32/", "/128/").
    let bitrate: number | undefined;
    try {
      const segs = new URL(server).pathname.split('/').filter(Boolean);
      const numSeg = segs.find((s) => /^\d+$/.test(s));
      if (numSeg) bitrate = parseInt(numSeg, 10);
    } catch {
      // ignore
    }

    return {
      id: String(m.id),
      name: m.name,
      server,
      surahTotal: m.surahs_list?.length,
      // Store the actual surah list so the UI can verify audio availability
      // for the selected surah without making network requests.
      surahs: Array.isArray(m.surahs_list) ? m.surahs_list : undefined,
      moshafType,
      bitrate,
    };
  }
}

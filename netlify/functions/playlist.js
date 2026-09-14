/*
 * Nina Universal Smart Video Player
 * Netlify Function: playlist.js
 *
 * FULL SYNCHRONIZED VERSION
 *
 * Sinkron dengan HTML terbaru:
 *
 * - GET playlist dengan pagination
 * - GET batch bertahap
 * - POST menggunakan batch
 * - POST retry otomatis
 * - GET retry otomatis
 * - PUT retry otomatis
 * - DELETE retry otomatis
 * - DELETE satu item berdasarkan id
 * - DELETE GROUP berdasarkan source_group
 * - DELETE YouTube berdasarkan channel_id
 * - DELETE ALL tetap tersedia sebagai fallback
 * - Response kosong aman
 * - Semua response Netlify selalu JSON valid
 * - Duplicate ID dicegah
 * - ID kosong dibuat otomatis
 *
 * Mendukung:
 *      YouTube
 *      IPTV
 *      Manual Link
 *
 * ==================================================
 * MANUAL METADATA UPGRADE
 * ==================================================
 *
 * Manual Link sekarang dapat mencoba mengambil:
 *
 * - HTML title
 * - Open Graph title
 * - Open Graph image
 * - Twitter image
 * - Twitter title
 * - Description
 * - Author / creator
 * - JSON-LD
 * - VideoObject
 * - thumbnailUrl
 * - uploadDate
 * - duration
 * - contentUrl
 * - embedUrl
 * - YouTube metadata melalui oEmbed
 * - Vimeo metadata melalui oEmbed
 * - Dailymotion metadata melalui oEmbed
 *
 * Metadata hanya diproses untuk:
 *
 *      sourceType = Manual
 *
 * YouTube Channel dan IPTV TIDAK diubah
 * dan TIDAK diproses ulang oleh metadata engine.
 */


/* ==================================================
 * ENVIRONMENT
 * ================================================== */

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLE =
  "nina_playlist";

const SUPABASE_ENDPOINT =
  `${SUPABASE_URL}/rest/v1/${TABLE}`;


/* ==================================================
 * CONFIG
 * ================================================== */

const GET_BATCH_SIZE =
  300;

const GET_CONCURRENCY =
  3;

const MAX_RETRY =
  3;

const RETRY_DELAY =
  800;

const POST_BATCH_SIZE =
  100;

const MAX_POST_ITEMS =
  5000;


/*
 * Manual metadata timeout.
 *
 * Supaya satu website yang lambat
 * tidak membuat seluruh import
 * ikut menggantung terlalu lama.
 */
const METADATA_TIMEOUT =
  10000;


/*
 * Maksimal HTML yang dibaca.
 *
 * Kita tidak perlu mengambil halaman
 * berukuran sangat besar hanya untuk
 * mencari metadata.
 */
const MAX_METADATA_BYTES =
  1500000;


/*
 * User agent sederhana.
 */
const METADATA_USER_AGENT =
  "Mozilla/5.0 (compatible; NinaUniversalSmartVideoPlayer/1.0; +https://nina-player.netlify.app/)";


/* ==================================================
 * HEADERS
 * ================================================== */

function supabaseHeaders(extra = {}){

  return {

    "apikey":
      SUPABASE_KEY,

    "Authorization":
      `Bearer ${SUPABASE_KEY}`,

    "Content-Type":
      "application/json",

    ...extra

  };

}


/* ==================================================
 * SLEEP
 * ================================================== */

function sleep(ms){

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );

}


/* ==================================================
 * GENERATE ID
 * ================================================== */

function generateId(){

  if(
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID ===
      "function"
  ){

    return globalThis.crypto.randomUUID();

  }

  return (
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .substring(2, 10)
  );

}


/* ==================================================
 * SAFE JSON PARSE
 * ================================================== */

function safeJsonParse(text){

  if(
    text === null ||
    text === undefined
  ){

    return null;

  }

  const value =
    String(text).trim();

  if(!value){

    return null;

  }

  try{

    return JSON.parse(
      value
    );

  }catch{

    return null;

  }

}


/* ==================================================
 * NORMALIZE TEXT
 * ================================================== */

function cleanText(value){

  if(
    value === null ||
    value === undefined
  ){

    return "";

  }

  return String(value)
    .replace(/\s+/g, " ")
    .trim();

}


/* ==================================================
 * HTML DECODE
 * ================================================== */

function decodeHtmlEntities(value){

  if(!value){

    return "";

  }

  return String(value)
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&#39;/gi,
      "'"
    )
    .replace(
      /&#x27;/gi,
      "'"
    )
    .replace(
      /&lt;/gi,
      "<"
    )
    .replace(
      /&gt;/gi,
      ">"
    )
    .replace(
      /&#(\d+);/g,
      (_, code) =>
        String.fromCharCode(
          Number(code)
        )
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, code) =>
        String.fromCharCode(
          parseInt(
            code,
            16
          )
        )
    );

}


/* ==================================================
 * ABSOLUTE URL
 * ================================================== */

function makeAbsoluteUrl(
  value,
  baseUrl
){

  if(!value){

    return "";

  }

  try{

    return new URL(
      value,
      baseUrl
    ).href;

  }catch{

    return "";

  }

}


/* ==================================================
 * URL VALIDATION
 * ================================================== */

function isHttpUrl(
  value
){

  try{

    const parsed =
      new URL(
        value
      );

    return (
      parsed.protocol ===
        "http:" ||
      parsed.protocol ===
        "https:"
    );

  }catch{

    return false;

  }

}


/* ==================================================
 * SSRF BASIC PROTECTION
 * ==================================================
 *
 * Tolak target lokal / private yang
 * umum digunakan untuk SSRF.
 * ================================================== */

function isBlockedHost(
  hostname
){

  if(!hostname){

    return true;

  }

  const host =
    hostname
      .toLowerCase()
      .trim();


  if(
    host === "localhost" ||
    host.endsWith(
      ".localhost"
    ) ||
    host === "0.0.0.0" ||
    host === "::1"
  ){

    return true;

  }


  /*
   * IPv4 literal.
   */
  const ipv4 =
    host.match(
      /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/
    );


  if(ipv4){

    const a =
      Number(
        ipv4[1]
      );

    const b =
      Number(
        ipv4[2]
      );


    /*
     * 10.0.0.0/8
     */
    if(
      a === 10
    ){

      return true;

    }


    /*
     * 127.0.0.0/8
     */
    if(
      a === 127
    ){

      return true;

    }


    /*
     * 169.254.0.0/16
     */
    if(
      a === 169 &&
      b === 254
    ){

      return true;

    }


    /*
     * 172.16.0.0/12
     */
    if(
      a === 172 &&
      b >= 16 &&
      b <= 31
    ){

      return true;

    }


    /*
     * 192.168.0.0/16
     */
    if(
      a === 192 &&
      b === 168
    ){

      return true;

    }


    /*
     * 0.0.0.0/8
     */
    if(
      a === 0
    ){

      return true;

    }

  }


  return false;

}


/* ==================================================
 * SAFE METADATA URL
 * ================================================== */

function isSafeMetadataUrl(
  value
){

  if(
    !isHttpUrl(
      value
    )
  ){

    return false;

  }

  try{

    const parsed =
      new URL(
        value
      );

    if(
      isBlockedHost(
        parsed.hostname
      )
    ){

      return false;

    }


    /*
     * Jangan izinkan username/password
     * di URL.
     */
    if(
      parsed.username ||
      parsed.password
    ){

      return false;

    }


    return true;

  }catch{

    return false;

  }

}


/* ==================================================
 * FETCH WITH TIMEOUT
 * ================================================== */

async function fetchWithTimeout(
  url,
  options = {},
  timeout = METADATA_TIMEOUT
){

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeout
    );


  try{

    return await fetch(
      url,
      {

        ...options,

        signal:
          controller.signal

      }
    );

  }finally{

    clearTimeout(
      timer
    );

  }

}


/* ==================================================
 * READ LIMITED RESPONSE
 * ================================================== */

async function readLimitedText(
  response
){

  if(
    !response ||
    !response.body
  ){

    const text =
      await response.text();

    return String(
      text || ""
    ).slice(
      0,
      MAX_METADATA_BYTES
    );

  }


  const reader =
    response.body.getReader();


  const decoder =
    new TextDecoder();

  let result =
    "";

  let total =
    0;


  while(true){

    const {
      done,
      value
    } =
      await reader.read();


    if(done){

      break;

    }


    if(!value){

      continue;

    }


    total +=
      value.byteLength;


    const remaining =
      MAX_METADATA_BYTES -
      result.length;


    if(
      remaining <= 0
    ){

      break;

    }


    const chunk =
      value.slice(
        0,
        remaining
      );


    result +=
      decoder.decode(
        chunk,
        {
          stream:
            true
        }
      );


    if(
      total >=
      MAX_METADATA_BYTES
    ){

      break;

    }

  }


  result +=
    decoder.decode();


  try{

    await reader.cancel();

  }catch{

    /* ignore */

  }


  return result;

}


/* ==================================================
 * EXTRACT META TAG
 * ================================================== */

function getMetaContent(
  html,
  attribute,
  value
){

  if(!html){

    return "";

  }


  const escaped =
    String(value)
      .replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );


  const pattern =
    new RegExp(
      `<meta[^>]+${attribute}\\s*=\\s*["']${escaped}["'][^>]+content\\s*=\\s*["']([^"']*)["'][^>]*>`,
      "i"
    );


  const reversePattern =
    new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]+${attribute}\\s*=\\s*["']${escaped}["'][^>]*>`,
      "i"
    );


  let match =
    html.match(
      pattern
    );


  if(!match){

    match =
      html.match(
        reversePattern
      );

  }


  return match
    ? decodeHtmlEntities(
        match[1]
      )
    : "";

}


/* ==================================================
 * EXTRACT TITLE
 * ================================================== */

function getHtmlTitle(
  html
){

  if(!html){

    return "";

  }


  const match =
    html.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );


  if(!match){

    return "";

  }


  return decodeHtmlEntities(
    cleanText(
      match[1]
    )
  );

}


/* ==================================================
 * EXTRACT AUTHOR
 * ================================================== */

function getAuthorFromMeta(
  html
){

  return (
    getMetaContent(
      html,
      "name",
      "author"
    ) ||

    getMetaContent(
      html,
      "name",
      "creator"
    ) ||

    getMetaContent(
      html,
      "property",
      "article:author"
    ) ||

    getMetaContent(
      html,
      "property",
      "og:author"
    ) ||

    getMetaContent(
      html,
      "name",
      "twitter:creator"
    ) ||

    ""
  );

}


/* ==================================================
 * EXTRACT JSON-LD
 * ================================================== */

function extractJsonLd(
  html
){

  const scripts =
    [];


  const regex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;


  let match;


  while(
    (
      match =
        regex.exec(
          html
        )
    ) !== null
  ){

    const raw =
      String(
        match[1] ||
        ""
      ).trim();


    if(!raw){

      continue;

    }


    const parsed =
      safeJsonParse(
        raw
      );


    if(parsed){

      if(
        Array.isArray(
          parsed
        )
      ){

        scripts.push(
          ...parsed
        );

      }else{

        scripts.push(
          parsed
        );

      }

    }

  }


  return scripts;

}


/* ==================================================
 * FIND VIDEO OBJECT
 * ================================================== */

function findVideoObject(
  jsonLdItems
){

  for(
    const item of jsonLdItems
  ){

    if(
      !item ||
      typeof item !==
        "object"
    ){

      continue;

    }


    const types =
      Array.isArray(
        item["@type"]
      )
        ? item["@type"]
        : [
            item["@type"]
          ];


    if(
      types.some(
        type =>
          String(
            type
          )
            .toLowerCase()
            .includes(
              "videoobject"
            )
      )
    ){

      return item;

    }


    /*
     * @graph.
     */
    if(
      Array.isArray(
        item["@graph"]
      )
    ){

      const found =
        findVideoObject(
          item["@graph"]
        );


      if(found){

        return found;

      }

    }

  }


  return null;

}


/* ==================================================
 * FIND GENERIC JSON-LD OBJECT
 * ================================================== */

function findUsefulJsonLd(
  jsonLdItems
){

  for(
    const item of jsonLdItems
  ){

    if(
      !item ||
      typeof item !==
        "object"
    ){

      continue;

    }


    if(
      item.name ||
      item.headline ||
      item.description ||
      item.thumbnailUrl ||
      item.contentUrl
    ){

      return item;

    }


    if(
      Array.isArray(
        item["@graph"]
      )
    ){

      const found =
        findUsefulJsonLd(
          item["@graph"]
        );


      if(found){

        return found;

      }

    }

  }


  return null;

}


/* ==================================================
 * ISO 8601 DURATION
 *
 * PT1H2M30S
 * ================================================== */

function parseIsoDuration(
  value
){

  if(!value){

    return 0;

  }


  const match =
    String(value).match(
      /^P(?:\d+D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i
    );


  if(!match){

    return 0;

  }


  const hours =
    Number(
      match[1] || 0
    );

  const minutes =
    Number(
      match[2] || 0
    );

  const seconds =
    Number(
      match[3] || 0
    );


  return Math.round(
    hours * 3600 +
    minutes * 60 +
    seconds
  );

}


/* ==================================================
 * FORMAT DURATION
 * ================================================== */

function formatDuration(
  seconds
){

  const total =
    Number(
      seconds || 0
    );


  if(
    !Number.isFinite(
      total
    ) ||
    total <= 0
  ){

    return "";

  }


  const h =
    Math.floor(
      total / 3600
    );

  const m =
    Math.floor(
      (
        total %
        3600
      ) / 60
    );

  const s =
    total %
    60;


  if(
    h > 0
  ){

    return (
      String(h) +
      ":" +
      String(m).padStart(
        2,
        "0"
      ) +
      ":" +
      String(s).padStart(
        2,
        "0"
      )
    );

  }


  return (
    String(m) +
    ":" +
    String(s).padStart(
      2,
      "0"
    )
  );

}


/* ==================================================
 * EXTRACT YOUTUBE ID
 * ================================================== */

function extractYouTubeId(
  url
){

  try{

    const parsed =
      new URL(
        url
      );


    const host =
      parsed.hostname
        .toLowerCase()
        .replace(
          /^www\./,
          ""
        );


    if(
      host ===
        "youtu.be"
    ){

      return (
        parsed.pathname
          .replace(
            /^\/+/,
            ""
          )
          .split(
            "/"
          )[0] ||
        ""
      );

    }


    if(
      host ===
        "youtube.com" ||
      host ===
        "m.youtube.com" ||
      host ===
        "music.youtube.com"
    ){

      const v =
        parsed.searchParams.get(
          "v"
        );


      if(v){

        return v;

      }


      const paths =
        parsed.pathname
          .split(
            "/"
          )
          .filter(Boolean);


      const index =
        paths.indexOf(
          "shorts"
        );


      if(
        index >= 0 &&
        paths[index + 1]
      ){

        return paths[
          index + 1
        ];

      }


      const embedIndex =
        paths.indexOf(
          "embed"
        );


      if(
        embedIndex >= 0 &&
        paths[
          embedIndex + 1
        ]
      ){

        return paths[
          embedIndex + 1
        ];

      }

    }

  }catch{

    return "";

  }


  return "";

}


/* ==================================================
 * YOUTUBE DETECTION
 * ================================================== */

function isYouTubeUrl(
  url
){

  return Boolean(
    extractYouTubeId(
      url
    )
  );

}


/* ==================================================
 * VIMEO DETECTION
 * ================================================== */

function isVimeoUrl(
  url
){

  try{

    const host =
      new URL(
        url
      ).hostname
        .toLowerCase()
        .replace(
          /^www\./,
          ""
        );


    return (
      host ===
        "vimeo.com" ||
      host ===
        "player.vimeo.com"
    );

  }catch{

    return false;

  }

}


/* ==================================================
 * DAILYMOTION DETECTION
 * ================================================== */

function isDailymotionUrl(
  url
){

  try{

    const host =
      new URL(
        url
      ).hostname
        .toLowerCase()
        .replace(
          /^www\./,
          ""
        );


    return (
      host ===
        "dailymotion.com" ||
      host ===
        "www.dailymotion.com" ||
      host.endsWith(
        ".dailymotion.com"
      ) ||
      host ===
        "dai.ly"
    );

  }catch{

    return false;

  }

}


/* ==================================================
 * SOURCE TYPE DETECTION
 * ================================================== */

function detectManualSourceType(
  url
){

  if(
    isYouTubeUrl(
      url
    )
  ){

    return "YouTube";

  }


  if(
    isVimeoUrl(
      url
    )
  ){

    return "Vimeo";

  }


  if(
    isDailymotionUrl(
      url
    )
  ){

    return "Dailymotion";

  }


  return "Website";

}


/* ==================================================
 * EXTRACT YOUTUBE OEMBED
 * ================================================== */

async function fetchYouTubeMetadata(
  url
){

  const youtubeId =
    extractYouTubeId(
      url
    );


  if(!youtubeId){

    return {};

  }


  const endpoint =
    "https://www.youtube.com/oembed" +
    `?url=${encodeURIComponent(url)}` +
    "&format=json";


  try{

    const response =
      await fetchWithTimeout(
        endpoint,
        {

          method:
            "GET",

          headers: {

            "User-Agent":
              METADATA_USER_AGENT,

            "Accept":
              "application/json"

          }

        }
      );


    if(
      !response.ok
    ){

      return {

        youtubeId

      };

    }


    const data =
      await response.json();


    return {

      youtubeId,

      title:
        cleanText(
          data.title
        ),

      thumbnail:
        data.thumbnail_url ||
        "",

      channelName:
        cleanText(
          data.author_name
        ),

      author:
        cleanText(
          data.author_name
        ),

      sourceType:
        "YouTube"

    };

  }catch(error){

    console.log(
      "Nina Manual YouTube metadata gagal:",
      error.message
    );


    return {

      youtubeId

    };

  }

}


/* ==================================================
 * EXTRACT VIMEO OEMBED
 * ================================================== */

async function fetchVimeoMetadata(
  url
){

  const endpoint =
    "https://vimeo.com/api/oembed.json" +
    `?url=${encodeURIComponent(url)}`;


  try{

    const response =
      await fetchWithTimeout(
        endpoint,
        {

          method:
            "GET",

          headers: {

            "User-Agent":
              METADATA_USER_AGENT,

            "Accept":
              "application/json"

          }

        }
      );


    if(
      !response.ok
    ){

      return {};

    }


    const data =
      await response.json();


    return {

      title:
        cleanText(
          data.title
        ),

      thumbnail:
        data.thumbnail_url ||
        "",

      channelName:
        cleanText(
          data.author_name
        ),

      author:
        cleanText(
          data.author_name
        ),

      durationSeconds:
        Number(
          data.duration ||
          0
        ),

      duration:
        formatDuration(
          data.duration
        ),

      sourceType:
        "Vimeo"

    };

  }catch(error){

    console.log(
      "Nina Manual Vimeo metadata gagal:",
      error.message
    );


    return {};

  }

}


/* ==================================================
 * FETCH GENERIC PAGE METADATA
 * ================================================== */

async function fetchGenericMetadata(
  url
){

  if(
    !isSafeMetadataUrl(
      url
    )
  ){

    return {};

  }


  try{

    const response =
      await fetchWithTimeout(
        url,
        {

          method:
            "GET",

          redirect:
            "follow",

          headers: {

            "User-Agent":
              METADATA_USER_AGENT,

            "Accept":
              "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",

            "Accept-Language":
              "id-ID,id;q=0.9,en;q=0.8"

          }

        }
      );


    if(
      !response.ok
    ){

      console.log(
        `Nina Manual metadata HTTP ${response.status}: ${url}`
      );


      return {};

    }


    const finalUrl =
      response.url ||
      url;


    const contentType =
      (
        response.headers
          .get(
            "content-type"
          ) ||
        ""
      )
        .toLowerCase();


    /*
     * Kalau langsung JSON,
     * coba baca sebagai JSON.
     */
    if(
      contentType.includes(
        "application/json"
      )
    ){

      const text =
        await readLimitedText(
          response
        );


      const data =
        safeJsonParse(
          text
        );


      if(
        data &&
        typeof data ===
          "object"
      ){

        return {

          finalUrl,

          title:
            cleanText(
              data.title ||
              data.name
            ),

          thumbnail:
            data.thumbnail ||
            data.thumbnail_url ||
            data.image ||
            "",

          description:
            cleanText(
              data.description
            ),

          author:
            cleanText(
              data.author_name ||
              data.author ||
              data.creator
            ),

          publishedAt:
            data.publishedAt ||
            data.published_at ||
            data.uploadDate ||
            "",

          durationSeconds:
            Number(
              data.durationSeconds ||
              data.duration ||
              0
            ),

          contentUrl:
            data.contentUrl ||
            data.content_url ||
            "",

          embedUrl:
            data.embedUrl ||
            data.embed_url ||
            ""

        };

      }


      return {

        finalUrl

      };

    }


    /*
     * Jika bukan HTML,
     * metadata halaman tidak bisa
     * diproses dengan aman.
     */
    if(
      !contentType.includes(
        "text/html"
      ) &&
      !contentType.includes(
        "application/xhtml"
      )
    ){

      return {

        finalUrl

      };

    }


    const html =
      await readLimitedText(
        response
      );


    if(!html){

      return {

        finalUrl

      };

    }


    /*
     * Standard HTML.
     */
    const htmlTitle =
      getHtmlTitle(
        html
      );


    /*
     * Open Graph.
     */
    const ogTitle =
      getMetaContent(
        html,
        "property",
        "og:title"
      );


    const ogDescription =
      getMetaContent(
        html,
        "property",
        "og:description"
      );


    const ogImage =
      getMetaContent(
        html,
        "property",
        "og:image"
      );


    const ogVideo =
      getMetaContent(
        html,
        "property",
        "og:video"
      ) ||
      getMetaContent(
        html,
        "property",
        "og:video:url"
      );


    /*
     * Twitter.
     */
    const twitterTitle =
      getMetaContent(
        html,
        "name",
        "twitter:title"
      );


    const twitterDescription =
      getMetaContent(
        html,
        "name",
        "twitter:description"
      );


    const twitterImage =
      getMetaContent(
        html,
        "name",
        "twitter:image"
      );


    /*
     * Description.
     */
    const metaDescription =
      getMetaContent(
        html,
        "name",
        "description"
      );


    /*
     * Author.
     */
    const author =
      getAuthorFromMeta(
        html
      );


    /*
     * JSON-LD.
     */
    const jsonLdItems =
      extractJsonLd(
        html
      );


    const videoObject =
      findVideoObject(
        jsonLdItems
      );


    const usefulJsonLd =
      findUsefulJsonLd(
        jsonLdItems
      );


    /*
     * Pilih metadata terbaik.
     */
    const jsonTitle =
      cleanText(
        videoObject?.name ||
        usefulJsonLd?.name ||
        usefulJsonLd?.headline
      );


    const jsonDescription =
      cleanText(
        videoObject?.description ||
        usefulJsonLd?.description
      );


    const jsonThumbnail =
      Array.isArray(
        videoObject?.thumbnailUrl
      )
        ? videoObject.thumbnailUrl[0]
        : (
            videoObject?.thumbnailUrl ||
            usefulJsonLd?.thumbnailUrl ||
            ""
          );


    const jsonAuthor =
      typeof videoObject?.author ===
        "string"
        ? videoObject.author

        : cleanText(
            videoObject?.author?.name ||
            usefulJsonLd?.author?.name ||
            usefulJsonLd?.author
          );


    const publishedAt =
      videoObject?.uploadDate ||
      videoObject?.datePublished ||
      usefulJsonLd?.uploadDate ||
      usefulJsonLd?.datePublished ||
      getMetaContent(
        html,
        "property",
        "article:published_time"
      ) ||
      getMetaContent(
        html,
        "name",
        "date"
      ) ||
      "";


    const durationRaw =
      videoObject?.duration ||
      usefulJsonLd?.duration ||
      "";


    const durationSeconds =
      parseIsoDuration(
        durationRaw
      );


    const contentUrl =
      makeAbsoluteUrl(
        videoObject?.contentUrl ||
        usefulJsonLd?.contentUrl ||
        ogVideo ||
        "",
        finalUrl
      );


    const embedUrl =
      makeAbsoluteUrl(
        videoObject?.embedUrl ||
        usefulJsonLd?.embedUrl ||
        "",
        finalUrl
      );


    const thumbnail =
      makeAbsoluteUrl(
        jsonThumbnail ||
        ogImage ||
        twitterImage ||
        "",
        finalUrl
      );


    const title =
      cleanText(
        jsonTitle ||
        ogTitle ||
        twitterTitle ||
        htmlTitle
      );


    const description =
      cleanText(
        jsonDescription ||
        ogDescription ||
        twitterDescription ||
        metaDescription
      );


    const finalAuthor =
      cleanText(
        jsonAuthor ||
        author
      );


    return {

      finalUrl,

      title,

      thumbnail,

      description,

      author:
        finalAuthor,

      channelName:
        finalAuthor,

      publishedAt,

      duration:
        formatDuration(
          durationSeconds
        ),

      durationSeconds,

      contentUrl,

      embedUrl

    };

  }catch(error){

    console.log(
      "Nina Manual generic metadata gagal:",
      error.message
    );


    return {};

  }

}


/* ==================================================
 * DETECT CONTENT TYPE
 * ================================================== */

function detectManualContentType(
  metadata,
  url
){

  const combined =
    (
      String(
        metadata?.description ||
        ""
      ) +
      " " +
      String(
        metadata?.title ||
        ""
      ) +
      " " +
      String(
        metadata?.contentUrl ||
        ""
      ) +
      " " +
      String(
        url ||
        ""
      )
    )
      .toLowerCase();


  if(
    metadata?.durationSeconds > 0 ||
    metadata?.embedUrl ||
    metadata?.contentUrl
  ){

    return "Video";

  }


  if(
    combined.includes(
      "live"
    ) ||
    combined.includes(
      "livestream"
    ) ||
    combined.includes(
      "live stream"
    )
  ){

    return "Live";

  }


  const lowerUrl =
    String(
      url ||
      ""
    )
      .toLowerCase();


  if(
    lowerUrl.match(
      /\.(mp4|m3u8|webm|mov|mkv|avi)(\?|#|$)/
    )
  ){

    return "Video";

  }


  if(
    lowerUrl.match(
      /\.(mp3|aac|m4a|wav|ogg)(\?|#|$)/
    )
  ){

    return "Audio";

  }


  return "Website";

}


/* ==================================================
 * FALLBACK TITLE DETECTION
 * ==================================================
 *
 * HTML saat ini biasanya sudah mengirim
 * title hasil getDefaultTitle().
 *
 * Kita hanya mengganti title tersebut
 * jika kelihatannya memang title fallback.
 *
 * Kalau user benar-benar memberikan
 * judul manual, judul user tetap dipertahankan.
 * ================================================== */

function isLikelyFallbackTitle(
  title,
  url
){

  const current =
    cleanText(
      title
    );


  if(!current){

    return true;

  }


  const lower =
    current.toLowerCase();


  const rawUrl =
    String(
      url ||
      ""
    );


  /*
   * Judul sama dengan URL.
   */
  if(
    current ===
    rawUrl
  ){

    return true;

  }


  try{

    const parsed =
      new URL(
        rawUrl
      );


    const hostname =
      parsed.hostname
        .replace(
          /^www\./i,
          ""
        );


    /*
     * Judul sama dengan hostname.
     */
    if(
      lower ===
      hostname.toLowerCase()
    ){

      return true;

    }


    /*
     * Judul sama dengan pathname
     * sederhana.
     */
    const pathname =
      decodeURIComponent(
        parsed.pathname
      )
        .replace(
          /^\/+/,
          ""
        )
        .replace(
          /[-_]+/g,
          " "
        )
        .trim();


    if(
      pathname &&
      lower ===
      pathname.toLowerCase()
    ){

      return true;

    }


    /*
     * Nama file.
     */
    const filename =
      pathname
        .split(
          "/"
        )
        .pop()
        ?.replace(
          /\.[a-z0-9]{2,5}$/i,
          ""
        )
        .replace(
          /[-_]+/g,
          " "
        )
        .trim();


    if(
      filename &&
      lower ===
      filename.toLowerCase()
    ){

      return true;

    }


    /*
     * Judul generik yang biasa dibuat
     * oleh sistem fallback.
     */
    const genericTitles = [

      "manual",

      "manual link",

      "link manual",

      "video",

      "website",

      "untitled",

      "untitled video",

      "unknown",

      "unknown video"

    ];


    if(
      genericTitles.includes(
        lower
      )
    ){

      return true;

    }

  }catch{

    /* ignore */

  }


  return false;

}


/* ==================================================
 * MANUAL METADATA ENGINE
 * ================================================== */

async function enrichManualItem(
  item
){

  if(
    !item ||
    !item.url
  ){

    return item;

  }


  /*
   * Hanya Manual yang diproses.
   */
  const sourceType =
    String(
      item.sourceType ||
      ""
    )
      .trim()
      .toLowerCase();


  if(
    sourceType !==
      "manual" &&
    sourceType !==
      "manual link"
  ){

    return item;

  }


  const url =
    String(
      item.url
    ).trim();


  if(
    !isHttpUrl(
      url
    )
  ){

    return item;

  }


  console.log(
    `Nina Manual Metadata START: ${url}`
  );


  let metadata =
    {};


  /*
   * --------------------------------------------------
   * YouTube
   * --------------------------------------------------
   */

  if(
    isYouTubeUrl(
      url
    )
  ){

    metadata =
      await fetchYouTubeMetadata(
        url
      );

  }


  /*
   * --------------------------------------------------
   * Vimeo
   * --------------------------------------------------
   */

  else if(
    isVimeoUrl(
      url
    )
  ){

    metadata =
      await fetchVimeoMetadata(
        url
      );

  }


  /*
   * --------------------------------------------------
   * Generic Website
   * --------------------------------------------------
   */

  else{

    metadata =
      await fetchGenericMetadata(
        url
      );

  }


  /*
   * Untuk generic website,
   * kalau title/thumbnail belum ada,
   * coba fallback dari HTML metadata.
   *
   * Tidak dilakukan untuk YouTube/Vimeo
   * supaya tidak perlu request tambahan.
   */
  if(
    !metadata.title &&
    !metadata.thumbnail &&
    !metadata.publishedAt
  ){

    if(
      !isYouTubeUrl(
        url
      ) &&
      !isVimeoUrl(
        url
      )
    ){

      const fallback =
        await fetchGenericMetadata(
          url
        );


      metadata = {

        ...fallback,

        ...metadata

      };

    }

  }


  /*
   * Clone supaya object asli tidak
   * berubah secara aneh.
   */
  const result = {

    ...item

  };


  /*
   * --------------------------------------------------
   * TITLE
   * --------------------------------------------------
   *
   * Judul manual user diprioritaskan.
   *
   * Hanya diganti jika title saat ini
   * terlihat seperti fallback.
   */

  if(
    metadata.title &&
    isLikelyFallbackTitle(
      result.title,
      url
    )
  ){

    result.title =
      metadata.title;

  }


  /*
   * Name mengikuti title jika kosong.
   */

  if(
    !cleanText(
      result.name
    ) ||
    isLikelyFallbackTitle(
      result.name,
      url
    )
  ){

    result.name =
      result.title ||
      metadata.title ||
      result.name ||
      "";

  }


  /*
   * --------------------------------------------------
   * THUMBNAIL
   * --------------------------------------------------
   */

  if(
    !result.thumbnail &&
    metadata.thumbnail
  ){

    result.thumbnail =
      metadata.thumbnail;

  }


  /*
   * --------------------------------------------------
   * YOUTUBE ID
   * --------------------------------------------------
   */

  const youtubeId =
    metadata.youtubeId ||
    extractYouTubeId(
      url
    );


  if(
    youtubeId
  ){

    result.youtubeId =
      youtubeId;

  }


  /*
   * --------------------------------------------------
   * CHANNEL / AUTHOR
   * --------------------------------------------------
   */

  if(
    !result.channelName &&
    metadata.channelName
  ){

    result.channelName =
      metadata.channelName;

  }


  /*
   * --------------------------------------------------
   * PUBLISHED DATE
   * --------------------------------------------------
   */

  if(
    !result.publishedAt &&
    metadata.publishedAt
  ){

    result.publishedAt =
      metadata.publishedAt;

  }


  /*
   * --------------------------------------------------
   * DURATION
   * --------------------------------------------------
   */

  if(
    (
      !Number(
        result.durationSeconds
      ) ||
      Number(
        result.durationSeconds
      ) <= 0
    ) &&
    Number(
      metadata.durationSeconds
    ) > 0
  ){

    result.durationSeconds =
      Number(
        metadata.durationSeconds
      );

  }


  if(
    !result.duration &&
    metadata.duration
  ){

    result.duration =
      metadata.duration;

  }


  /*
   * Kalau durationSeconds ada tetapi
   * duration kosong, format ulang.
   */

  if(
    !result.duration &&
    Number(
      result.durationSeconds
    ) > 0
  ){

    result.duration =
      formatDuration(
        result.durationSeconds
      );

  }


  /*
   * --------------------------------------------------
   * CONTENT TYPE
   * --------------------------------------------------
   */

  result.contentType =
    detectManualContentType(
      metadata,
      url
    );


  /*
   * --------------------------------------------------
   * MEDIA TYPE
   * --------------------------------------------------
   */

  if(
    result.contentType ===
    "Video"
  ){

    result.mediaType =
      "video";

  }

  else if(
    result.contentType ===
    "Audio"
  ){

    result.mediaType =
      "audio";

  }

  else if(
    result.contentType ===
    "Live"
  ){

    result.mediaType =
      "live";

  }

  else if(
    !result.mediaType
  ){

    result.mediaType =
      "website";

  }


  /*
   * --------------------------------------------------
   * LIVE
   * --------------------------------------------------
   */

  const metadataText =
    (
      String(
        metadata.title ||
        ""
      ) +
      " " +
      String(
        metadata.description ||
        ""
      )
    )
      .toLowerCase();


  if(
    metadataText.includes(
      "live stream"
    ) ||
    metadataText.includes(
      "livestream"
    )
  ){

    result.isLive =
      true;

  }


  /*
   * --------------------------------------------------
   * SOURCE GROUP
   * --------------------------------------------------
   *
   * Tetap "Link Manual".
   *
   * Jangan mengubah group karena fungsi
   * deleteManualGroup() bergantung pada
   * source_group ini.
   */

  result.sourceGroup =
    result.sourceGroup ||
    "Link Manual";


  result.channelGroup =
    result.channelGroup ||
    "Link Manual";


  /*
   * --------------------------------------------------
   * SOURCE TYPE
   * --------------------------------------------------
   *
   * Tetap Manual supaya:
   *
   * - masuk grup Manual
   * - tidak bercampur dengan YouTube Channel
   * - delete group tetap aman
   *
   * Tetapi metadata YouTube/Vimeo tetap
   * disimpan pada field yang tersedia.
   */

  result.sourceType =
    "Manual";


  /*
   * --------------------------------------------------
   * PLAYLIST SOURCE
   * --------------------------------------------------
   */

  if(
    !result.playlistSource
  ){

    try{

      result.playlistSource =
        new URL(
          url
        ).hostname
          .replace(
            /^www\./i,
            ""
          );

    }catch{

      result.playlistSource =
        "";

    }

  }


  /*
   * --------------------------------------------------
   * ADD AT
   * --------------------------------------------------
   */

  if(
    !result.addedAt
  ){

    result.addedAt =
      Date.now();

  }


  console.log(
    `Nina Manual Metadata DONE: ${result.title || url}`
  );


  return result;

}


/* ==================================================
 * MAP DATABASE -> HTML
 *
 * Supabase snake_case
 *        ↓
 * HTML camelCase
 * ================================================== */

function mapRow(row){

  return {

    id:
      row.id,

    url:
      row.url || "",

    title:
      row.title || "",

    name:
      row.name || "",

    youtubeId:
      row.youtube_id || "",

    thumbnail:
      row.thumbnail || "",

    publishedAt:
      row.published_at || "",


    sourceType:
      row.source_type || "",

    sourceGroup:
      row.source_group || "",

    channelName:
      row.channel_name || "",

    channelId:
      row.channel_id || "",

    channelGroup:
      row.channel_group || "",


    tvgId:
      row.tvg_id || "",

    tvgName:
      row.tvg_name || "",

    tvgLogo:
      row.tvg_logo || "",

    tvgCountry:
      row.tvg_country || "",

    tvgLanguage:
      row.tvg_language || "",

    tvgShift:
      row.tvg_shift || "",


    playlistSource:
      row.playlist_source || "",


    contentType:
      row.content_type || "",

    duration:
      row.duration || "",

    durationSeconds:
      Number(
        row.duration_seconds || 0
      ),


    isLive:
      Boolean(
        row.is_live
      ),


    mediaType:
      row.media_type || "",


    addedAt:
      Number(
        row.added_at || 0
      )

  };

}


/* ==================================================
 * MAP HTML -> DATABASE
 *
 * HTML camelCase
 *        ↓
 * Supabase snake_case
 * ================================================== */

function mapItem(item){

  return {

    id:
      item.id ||
      generateId(),

    url:
      item.url || "",

    title:
      item.title || "",

    name:
      item.name ||
      item.title ||
      "",


    youtube_id:
      item.youtubeId || "",

    thumbnail:
      item.thumbnail || "",

    published_at:
      item.publishedAt || "",


    source_type:
      item.sourceType || "",

    source_group:
      item.sourceGroup || "",

    channel_name:
      item.channelName || "",

    channel_id:
      item.channelId || "",

    channel_group:
      item.channelGroup || "",


    tvg_id:
      item.tvgId || "",

    tvg_name:
      item.tvgName || "",

    tvg_logo:
      item.tvgLogo || "",

    tvg_country:
      item.tvgCountry || "",

    tvg_language:
      item.tvgLanguage || "",

    tvg_shift:
      item.tvgShift || "",


    playlist_source:
      item.playlistSource || "",


    content_type:
      item.contentType || "",

    duration:
      item.duration || "",

    duration_seconds:
      Number(
        item.durationSeconds || 0
      ),


    is_live:
      Boolean(
        item.isLive
      ),


    media_type:
      item.mediaType || "",


    added_at:
      Number(
        item.addedAt ||
        Date.now()
      )

  };

}


/* ==================================================
 * SUPABASE FETCH
 * ================================================== */

async function supabaseFetch(
  url,
  options = {},
  retryCount = 0
){

  let response;

  try{

    response =
      await fetch(
        url,
        options
      );

  }catch(error){

    if(
      retryCount <
      MAX_RETRY
    ){

      const delay =
        RETRY_DELAY *
        (
          retryCount + 1
        );

      console.log(
        `Supabase network error. Retry ${retryCount + 1}/${MAX_RETRY} dalam ${delay}ms:`,
        error.message
      );

      await sleep(
        delay
      );

      return supabaseFetch(
        url,
        options,
        retryCount + 1
      );

    }

    throw error;

  }


  const text =
    await response.text();


  if(
    response.ok
  ){

    return {

      response,

      text

    };

  }


  const retryable =
    response.status === 408 ||
    response.status === 429 ||
    response.status === 500 ||
    response.status === 502 ||
    response.status === 503 ||
    response.status === 504;


  if(
    retryable &&
    retryCount <
    MAX_RETRY
  ){

    const delay =
      RETRY_DELAY *
      (
        retryCount + 1
      );

    console.log(
      `Supabase HTTP ${response.status}. Retry ${retryCount + 1}/${MAX_RETRY} dalam ${delay}ms`
    );

    await sleep(
      delay
    );

    return supabaseFetch(
      url,
      options,
      retryCount + 1
    );

  }


  const error =
    new Error(
      `Supabase HTTP ${response.status}: ${
        text ||
        "response kosong"
      }`
    );

  error.status =
    response.status;

  error.supabaseResponse =
    text;

  throw error;

}


/* ==================================================
 * GET ONE PAGE
 * ================================================== */

async function getPage(
  offset
){

  const url =
    `${SUPABASE_ENDPOINT}` +
    `?select=*` +
    `&order=added_at.asc,id.asc` +
    `&limit=${GET_BATCH_SIZE}` +
    `&offset=${offset}`;


  console.log(
    `Nina GET offset=${offset}, limit=${GET_BATCH_SIZE}`
  );


  const result =
    await supabaseFetch(
      url,
      {

        method:
          "GET",

        headers:
          supabaseHeaders()

      }
    );


  if(
    !result.text ||
    !result.text.trim()
  ){

    return [];

  }


  const rows =
    safeJsonParse(
      result.text
    );


  if(
    rows === null
  ){

    throw new Error(
      `Response Supabase GET bukan JSON valid pada offset ${offset}.`
    );

  }


  if(
    !Array.isArray(rows)
  ){

    throw new Error(
      `Response Supabase GET bukan array pada offset ${offset}.`
    );

  }


  return rows;

}


/* ==================================================
 * GET SELURUH PLAYLIST
 * ================================================== */

async function getAllPlaylist(){

  let allRows =
    [];


  const firstPage =
    await getPage(
      0
    );


  allRows.push(
    ...firstPage
  );


  if(
    firstPage.length <
    GET_BATCH_SIZE
  ){

    return allRows;

  }


  let nextOffset =
    GET_BATCH_SIZE;


  while(true){

    const offsets =
      [];


    for(
      let i = 0;
      i < GET_CONCURRENCY;
      i++
    ){

      offsets.push(
        nextOffset +
        (
          i *
          GET_BATCH_SIZE
        )
      );

    }


    console.log(
      "Nina GET wave:",
      offsets
    );


    const pages =
      await Promise.all(
        offsets.map(
          getPage
        )
      );


    let finished =
      false;


    for(
      const page of pages
    ){

      allRows.push(
        ...page
      );


      if(
        page.length <
        GET_BATCH_SIZE
      ){

        finished =
          true;

      }

    }


    if(
      finished
    ){

      break;

    }


    nextOffset +=
      GET_CONCURRENCY *
      GET_BATCH_SIZE;

  }


  return allRows;

}


/* ==================================================
 * REMOVE DUPLICATE ROW
 * ================================================== */

function uniqueRowsById(
  rows
){

  const uniqueMap =
    new Map();


  for(
    const row of rows
  ){

    if(
      row &&
      row.id
    ){

      uniqueMap.set(
        String(row.id),
        row
      );

    }

  }


  return Array.from(
    uniqueMap.values()
  );

}


/* ==================================================
 * JSON RESPONSE
 * ================================================== */

function jsonResponse(
  statusCode,
  headers,
  data
){

  return {

    statusCode,

    headers,

    body:
      JSON.stringify(
        data
      )

  };

}


/* ==================================================
 * MAIN HANDLER
 * ================================================== */

exports.handler =
  async function(event){

  const headers = {

    "Content-Type":
      "application/json; charset=utf-8",

    "Access-Control-Allow-Origin":
      "*",

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Access-Control-Allow-Methods":
      "GET,POST,PUT,DELETE,OPTIONS",

    "Cache-Control":
      "no-store"

  };


  try{

    /* ==================================================
     * ENVIRONMENT CHECK
     * ================================================== */

    if(
      !SUPABASE_URL ||
      !SUPABASE_KEY
    ){

      return jsonResponse(
        500,
        headers,
        {

          success:
            false,

          error:
            "SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum tersedia."

        }
      );

    }


    /* ==================================================
     * OPTIONS
     * ================================================== */

    if(
      event.httpMethod ===
      "OPTIONS"
    ){

      return {

        statusCode:
          204,

        headers,

        body:
          ""

      };

    }


    /* ==================================================
     * GET
     * ================================================== */

    if(
      event.httpMethod ===
      "GET"
    ){

      console.log(
        "Nina Playlist GET START"
      );


      const allRows =
        await getAllPlaylist();


      const uniqueRows =
        uniqueRowsById(
          allRows
        );


      const videos =
        uniqueRows.map(
          mapRow
        );


      console.log(
        `Nina GET SELESAI: ${videos.length} records`
      );


      return jsonResponse(
        200,
        headers,
        videos
      );

    }


    /* ==================================================
     * POST
     * ================================================== */

    if(
      event.httpMethod ===
      "POST"
    ){

      let body;


      try{

        body =
          event.body
            ? JSON.parse(
                event.body
              )
            : null;

      }catch{

        return jsonResponse(
          400,
          headers,
          {

            success:
              false,

            error:
              "Body request bukan JSON yang valid."

          }
        );

      }


      const items =
        Array.isArray(body)

          ? body

          : Array.isArray(
              body?.videos
            )

            ? body.videos

            : body
              ? [body]
              : [];


      if(
        !items.length
      ){

        return jsonResponse(
          400,
          headers,
          {

            success:
              false,

            error:
              "Tidak ada data video."

          }
        );

      }


      if(
        items.length >
        MAX_POST_ITEMS
      ){

        return jsonResponse(
          413,
          headers,
          {

            success:
              false,

            error:
              `Maksimal ${MAX_POST_ITEMS} item per proses import.`

          }
        );

      }


      /*
       * ==================================================
       * MANUAL METADATA ENRICHMENT
       * ==================================================
       *
       * Hanya Manual.
       *
       * YouTube Channel:
       * TIDAK disentuh.
       *
       * IPTV:
       * TIDAK disentuh.
       */

      const enrichedItems =
        [];


      for(
        const item of items
      ){

        try{

          const sourceType =
            String(
              item?.sourceType ||
              ""
            )
              .trim()
              .toLowerCase();


          if(
            sourceType ===
              "manual" ||
            sourceType ===
              "manual link"
          ){

            const enriched =
              await enrichManualItem(
                item
              );


            enrichedItems.push(
              enriched
            );

          }else{

            /*
             * YouTube dan IPTV
             * tetap identik seperti sebelumnya.
             */

            enrichedItems.push(
              item
            );

          }

        }catch(error){

          /*
           * Metadata gagal bukan berarti
           * import harus gagal.
           *
           * Data manual tetap disimpan.
           */

          console.error(
            "Nina Manual Metadata Error:",
            error
          );


          enrichedItems.push(
            item
          );

        }

      }


      /*
       * HTML -> Database.
       */

      const mappedRows =
        enrichedItems.map(
          mapItem
        );


      /*
       * Pastikan setiap ID unik.
       */

      const uniqueMap =
        new Map();


      for(
        const row of mappedRows
      ){

        let id =
          String(
            row.id ||
            ""
          ).trim();


        if(!id){

          id =
            generateId();

        }


        row.id =
          id;


        uniqueMap.set(
          id,
          row
        );

      }


      const rows =
        Array.from(
          uniqueMap.values()
        );


      const duplicateRemoved =
        items.length -
        rows.length;


      let savedCount =
        0;


      const errors =
        [];


      /*
       * POST per batch.
       */

      for(
        let i = 0;
        i < rows.length;
        i += POST_BATCH_SIZE
      ){

        const batch =
          rows.slice(
            i,
            i + POST_BATCH_SIZE
          );


        const batchNumber =
          Math.floor(
            i /
            POST_BATCH_SIZE
          ) + 1;


        console.log(
          `Nina POST batch ${batchNumber}: ${batch.length}`
        );


        try{

          await supabaseFetch(
            SUPABASE_ENDPOINT,
            {

              method:
                "POST",

              headers:
                supabaseHeaders({

                  "Prefer":
                    "resolution=merge-duplicates,return=minimal"

                }),

              body:
                JSON.stringify(
                  batch
                )

            }
          );


          savedCount +=
            batch.length;

        }catch(error){

          console.error(
            `Nina POST batch ${batchNumber} gagal:`,
            error
          );


          errors.push({

            batch:
              batchNumber,

            count:
              batch.length,

            error:
              error.message

          });

        }

      }


      /*
       * Ada batch gagal.
       */

      if(
        errors.length
      ){

        return jsonResponse(
          500,
          headers,
          {

            success:
              false,

            count:
              savedCount,

            total:
              rows.length,

            duplicateRemoved:
              duplicateRemoved,

            message:
              "Sebagian playlist berhasil disimpan, tetapi ada batch yang gagal.",

            errors:
              errors

          }
        );

      }


      /*
       * SEMUA BERHASIL.
       */

      return jsonResponse(
        200,
        headers,
        {

          success:
            true,

          count:
            savedCount,

          total:
            rows.length,

          duplicateRemoved:
            duplicateRemoved,

          message:
            "Playlist berhasil disimpan."

        }
      );

    }


    /* ==================================================
     * PUT
     * ================================================== */

    if(
      event.httpMethod ===
      "PUT"
    ){

      let body;


      try{

        body =
          event.body
            ? JSON.parse(
                event.body
              )
            : null;

      }catch{

        return jsonResponse(
          400,
          headers,
          {

            success:
              false,

            error:
              "Body request bukan JSON yang valid."

          }
        );

      }


      if(
        !body ||
        !body.id
      ){

        return jsonResponse(
          400,
          headers,
          {

            success:
              false,

            error:
              "ID video tidak ditemukan."

          }
        );

      }


      const row = {

        url:
          body.url || "",

        title:
          body.title || "",

        name:
          body.name ||
          body.title ||
          "",


        youtube_id:
          body.youtubeId || "",

        thumbnail:
          body.thumbnail || "",

        published_at:
          body.publishedAt || "",


        source_type:
          body.sourceType || "",

        source_group:
          body.sourceGroup || "",

        channel_name:
          body.channelName || "",

        channel_id:
          body.channelId || "",

        channel_group:
          body.channelGroup || "",


        tvg_id:
          body.tvgId || "",

        tvg_name:
          body.tvgName || "",

        tvg_logo:
          body.tvgLogo || "",

        tvg_country:
          body.tvgCountry || "",

        tvg_language:
          body.tvgLanguage || "",

        tvg_shift:
          body.tvgShift || "",


        playlist_source:
          body.playlistSource || "",


        content_type:
          body.contentType || "",

        duration:
          body.duration || "",

        duration_seconds:
          Number(
            body.durationSeconds || 0
          ),


        is_live:
          Boolean(
            body.isLive
          ),


        media_type:
          body.mediaType || "",


        added_at:
          Number(
            body.addedAt ||
            Date.now()
          )

      };


      const result =
        await supabaseFetch(
          `${SUPABASE_ENDPOINT}?id=eq.${encodeURIComponent(body.id)}`,
          {

            method:
              "PATCH",

            headers:
              supabaseHeaders({

                "Prefer":
                  "return=representation"

              }),

            body:
              JSON.stringify(
                row
              )

          }
        );


      const data =
        safeJsonParse(
          result.text
        );


      if(
        !Array.isArray(data) ||
        data.length === 0
      ){

        return jsonResponse(
          404,
          headers,
          {

            success:
              false,

            error:
              "Video tidak ditemukan."

          }
        );

      }


      return jsonResponse(
        200,
        headers,
        {

          success:
            true,

          message:
            "Channel berhasil diperbarui.",

          data:
            data

        }
      );

    }


    /* ==================================================
     * DELETE
     * ================================================== */

    if(
      event.httpMethod ===
      "DELETE"
    ){

      const params =
        event.queryStringParameters ||
        {};


      const id =
        params.id || "";


      const group =
        params.group ||
        params.sourceGroup ||
        "";


      const channelId =
        params.channelId ||
        "";


      /* ==================================================
       * DELETE ALL
       * ================================================== */

      if(
        String(params.all)
          .toLowerCase() ===
        "true"
      ){

        console.log(
          "Nina DELETE ALL START"
        );


        await supabaseFetch(
          `${SUPABASE_ENDPOINT}?id=not.is.null`,
          {

            method:
              "DELETE",

            headers:
              supabaseHeaders({

                "Prefer":
                  "return=minimal"

              })

          }
        );


        console.log(
          "Nina DELETE ALL SELESAI"
        );


        return jsonResponse(
          200,
          headers,
          {

            success:
              true,

            deleted:
              "all",

            message:
              "Semua channel berhasil dihapus."

          }
        );

      }


      /* ==================================================
       * DELETE GROUP
       * ================================================== */

      if(
        String(group).trim()
      ){

        const groupName =
          String(
            group
          ).trim();


        console.log(
          `Nina DELETE GROUP START group=${groupName}`
        );


        const deleteUrl =
          `${SUPABASE_ENDPOINT}` +
          `?source_group=eq.${encodeURIComponent(groupName)}`;


        await supabaseFetch(
          deleteUrl,
          {

            method:
              "DELETE",

            headers:
              supabaseHeaders({

                "Prefer":
                  "return=minimal"

              })

          }
        );


        console.log(
          `Nina DELETE GROUP SELESAI group=${groupName}`
        );


        return jsonResponse(
          200,
          headers,
          {

            success:
              true,

            deleted:
              true,

            group:
              groupName,

            message:
              `Grup "${groupName}" berhasil dihapus.`

          }
        );

      }


      /* ==================================================
       * DELETE YOUTUBE CHANNEL
       * ================================================== */

      if(
        String(channelId).trim()
      ){

        const youtubeChannelId =
          String(
            channelId
          ).trim();


        console.log(
          `Nina DELETE YOUTUBE CHANNEL START channelId=${youtubeChannelId}`
        );


        const deleteUrl =
          `${SUPABASE_ENDPOINT}` +
          `?source_type=eq.YouTube` +
          `&channel_id=eq.${encodeURIComponent(youtubeChannelId)}`;


        await supabaseFetch(
          deleteUrl,
          {

            method:
              "DELETE",

            headers:
              supabaseHeaders({

                "Prefer":
                  "return=minimal"

              })

          }
        );


        console.log(
          `Nina DELETE YOUTUBE CHANNEL SELESAI channelId=${youtubeChannelId}`
        );


        return jsonResponse(
          200,
          headers,
          {

            success:
              true,

            deleted:
              true,

            channelId:
              youtubeChannelId,

            sourceType:
              "YouTube",

            message:
              "Channel YouTube berhasil dihapus."

          }
        );

      }


      /* ==================================================
       * DELETE ONE ITEM
       * ================================================== */

      if(
        String(id).trim()
      ){

        const itemId =
          String(
            id
          ).trim();


        console.log(
          `Nina DELETE START id=${itemId}`
        );


        const result =
          await supabaseFetch(
            `${SUPABASE_ENDPOINT}?id=eq.${encodeURIComponent(itemId)}`,
            {

              method:
                "DELETE",

              headers:
                supabaseHeaders({

                  "Prefer":
                    "return=representation"

                })

            }
          );


        if(
          !result.text ||
          !result.text.trim()
        ){

          return jsonResponse(
            404,
            headers,
            {

              success:
                false,

              deleted:
                false,

              error:
                "Item tidak ditemukan atau sudah terhapus."

            }
          );

        }


        const deletedRows =
          safeJsonParse(
            result.text
          );


        if(
          !Array.isArray(
            deletedRows
          )
        ){

          return jsonResponse(
            500,
            headers,
            {

              success:
                false,

              deleted:
                false,

              error:
                "Supabase memberikan response penghapusan yang tidak valid."

            }
          );

        }


        if(
          deletedRows.length ===
          0
        ){

          return jsonResponse(
            404,
            headers,
            {

              success:
                false,

              deleted:
                false,

              error:
                "Item tidak ditemukan atau sudah terhapus."

            }
          );

        }


        const confirmed =
          deletedRows.some(
            row =>
              String(
                row.id
              ) ===
              String(
                itemId
              )
          );


        if(!confirmed){

          return jsonResponse(
            500,
            headers,
            {

              success:
                false,

              deleted:
                false,

              error:
                "Penghapusan belum dapat dikonfirmasi."

            }
          );

        }


        console.log(
          `Nina DELETE SELESAI id=${itemId}`
        );


        return jsonResponse(
          200,
          headers,
          {

            success:
              true,

            deleted:
              true,

            id:
              itemId,

            message:
              "Item berhasil dihapus."

          }
        );

      }


      /* ==================================================
       * DELETE TANPA PARAMETER
       * ================================================== */

      return jsonResponse(
        400,
        headers,
        {

          success:
            false,

          deleted:
            false,

          error:
            "Gunakan ?id=..., ?group=..., ?sourceGroup=..., ?channelId=... atau ?all=true"

        }
      );

    }


    /* ==================================================
     * METHOD TIDAK DIDUKUNG
     * ================================================== */

    return jsonResponse(
      405,
      headers,
      {

        success:
          false,

        error:
          "Method tidak didukung."

      }
    );


  }catch(error){

    console.error(
      "Nina Playlist Error:",
      error
    );


    return jsonResponse(
      error.status >= 400 &&
      error.status < 600
        ? error.status
        : 500,
      headers,
      {

        success:
          false,

        error:
          error.message ||
          "Terjadi kesalahan server."

      }
    );

  }

};
